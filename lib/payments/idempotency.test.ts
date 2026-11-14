import { describe, expect, it } from "vitest";
import { idempotencyKeySchema } from "../../contracts/schemas";
import { KEY_TTL_MS, createBrowserKeyStore, createIntentKeys, createMemoryKeyStore } from "./idempotency";
import { buildInitiateInput, intentFingerprint, type PaymentIntent } from "./intent";

const intent: PaymentIntent = { purpose: "one_time_contribution", amountKobo: 500000, channel: "card" };

function keys(overrides: { store?: ReturnType<typeof createMemoryKeyStore>; now?: () => number } = {}) {
  let n = 0;
  const store = overrides.store ?? createMemoryKeyStore();
  const api = createIntentKeys({ store, now: overrides.now ?? (() => 1_000_000), newId: () => `id-${(n += 1)}-aaaaaaaaaaaaaaaa` });
  return { api, store };
}

describe("intent fingerprint", () => {
  it("is stable and treats missing and undefined the same", () => {
    expect(intentFingerprint(intent)).toBe(intentFingerprint({ ...intent, obligationId: undefined }));
  });

  it.each([
    [{ amountKobo: 500001 }],
    [{ obligationId: "ob-1" }],
    [{ paymentMethodId: "pm-1" }],
    [{ channel: "ussd" as const }],
    [{ purpose: "scheduled_contribution" as const }],
  ])("changes when the intent changes: %j", (patch) => {
    expect(intentFingerprint({ ...intent, ...patch })).not.toBe(intentFingerprint(intent));
  });
});

describe("intent keys", () => {
  it("returns the same key for repeated taps of the same intent", () => {
    const { api } = keys();
    const first = api.keyFor(intent);
    expect(api.keyFor(intent)).toBe(first);
    expect(api.keyFor({ ...intent })).toBe(first);
  });

  it("keeps the key across a page reload because it lives in the store", () => {
    const store = createMemoryKeyStore();
    const before = keys({ store }).api.keyFor(intent);
    const afterReload = keys({ store }).api.keyFor(intent);
    expect(afterReload).toBe(before);
  });

  it("gives a different key when the intent changes", () => {
    const { api } = keys();
    expect(api.keyFor({ ...intent, amountKobo: 600000 })).not.toBe(api.keyFor(intent));
  });

  it("gives a new key after the key is released", () => {
    const { api } = keys();
    const first = api.keyFor(intent);
    api.release(intent);
    expect(api.keyFor(intent)).not.toBe(first);
  });

  it("replaces a key that is older than the ttl, and not before", () => {
    let now = 1_000_000;
    const { api } = keys({ now: () => now });
    const first = api.keyFor(intent);
    now += KEY_TTL_MS - 1;
    expect(api.keyFor(intent)).toBe(first);
    now += 1;
    expect(api.keyFor(intent)).not.toBe(first);
  });

  it("replaces a key stored with a time in the future, which only a clock problem can cause", () => {
    let now = 1_000_000;
    const { api } = keys({ now: () => now });
    const first = api.keyFor(intent);
    now -= 5_000;
    expect(api.keyFor(intent)).not.toBe(first);
  });

  it("always produces keys the contract accepts", () => {
    const { api } = keys();
    expect(idempotencyKeySchema.safeParse(api.keyFor(intent)).success).toBe(true);
  });

  it("refuses to create a key the contract would reject", () => {
    const api = createIntentKeys({ store: createMemoryKeyStore(), now: () => 1, newId: () => "bad key with spaces" });
    expect(() => api.keyFor(intent)).toThrow(RangeError);
  });

  it.each([["not json"], ["{}"], ['{"key":5,"createdAt":1}'], ['{"key":"short","createdAt":1000000}'], ['{"key":"gg_valid-key-aaaaaaaaaaaaaaaa","createdAt":"x"}']])(
    "replaces a corrupt stored value %s",
    (raw) => {
      const store = createMemoryKeyStore();
      store.set(`gg:pay:key:${intentFingerprint(intent)}`, raw);
      const { api } = keys({ store });
      expect(idempotencyKeySchema.safeParse(api.keyFor(intent)).success).toBe(true);
    },
  );
});

describe("browser key store", () => {
  it("keeps working in memory when storage is missing", () => {
    const store = createBrowserKeyStore(undefined);
    store.set("a", "1");
    expect(store.get("a")).toBe("1");
    store.remove("a");
    expect(store.get("a")).toBeNull();
  });

  it("keeps working in memory when every storage call throws", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    const store = createBrowserKeyStore({ getItem: boom, setItem: boom, removeItem: boom });
    store.set("a", "1");
    expect(store.get("a")).toBe("1");
    store.remove("a");
    expect(store.get("a")).toBeNull();
  });

  it("reads and writes through real storage when it works", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
    const store = createBrowserKeyStore(storage);
    store.set("a", "1");
    expect(data.get("a")).toBe("1");
    store.remove("a");
    expect(data.has("a")).toBe(false);
  });
});

describe("buildInitiateInput", () => {
  const key = "gg_valid-key-aaaaaaaaaaaaaaaa";

  it("builds a contract input and omits absent optional fields", () => {
    const result = buildInitiateInput(intent, key);
    expect(result).toEqual({ ok: true, input: { purpose: "one_time_contribution", amountKobo: 500000, idempotencyKey: key, channel: "card" } });
  });

  it.each([[0], [-5], [1.5], [100_000_000 * 100 + 1]])("rejects amount %s with a field message", (amountKobo) => {
    const result = buildInitiateInput({ ...intent, amountKobo }, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fields.amountKobo).toBeDefined();
    }
  });

  it("rejects a bad obligation id and a bad key", () => {
    const badId = buildInitiateInput({ ...intent, obligationId: "nope" }, key);
    expect(badId.ok).toBe(false);
    const badKey = buildInitiateInput(intent, "short");
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) {
      expect(badKey.fields.idempotencyKey).toBeDefined();
    }
  });
});
