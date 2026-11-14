import { idempotencyKeySchema } from "../../contracts/schemas";
import { intentFingerprint, type PaymentIntent } from "./intent";

/** Where keys live between taps, reloads and tabs. Synchronous so a key is never lost to a race. */
export interface KeyStore {
  get(name: string): string | null;
  set(name: string, value: string): void;
  remove(name: string): void;
}

export function createMemoryKeyStore(): KeyStore {
  const map = new Map<string, string>();
  return {
    get: (name) => map.get(name) ?? null,
    set: (name, value) => void map.set(name, value),
    remove: (name) => void map.delete(name),
  };
}

/**
 * Browser storage with a memory fallback. Storage can be missing, full or blocked (private modes), and every
 * call can throw, so each one is guarded. The memory copy keeps a double tap safe within the page even then.
 */
export function createBrowserKeyStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined): KeyStore {
  const memory = createMemoryKeyStore();
  return {
    get(name) {
      try {
        const stored = storage?.getItem(name) ?? null;
        if (stored !== null) {
          return stored;
        }
      } catch {
        // fall through to memory
      }
      return memory.get(name);
    },
    set(name, value) {
      memory.set(name, value);
      try {
        storage?.setItem(name, value);
      } catch {
        // memory copy remains
      }
    },
    remove(name) {
      memory.remove(name);
      try {
        storage?.removeItem(name);
      } catch {
        // memory copy already removed
      }
    },
  };
}

/** After this long an unfinished key is replaced, so an old expired attempt cannot trap the member. */
export const KEY_TTL_MS = 2 * 60 * 60 * 1000;

export interface IntentKeysDeps {
  readonly store: KeyStore;
  readonly now: () => number;
  readonly newId: () => string;
  readonly ttlMs?: number;
}

export interface IntentKeys {
  /** Same intent gives the same key until it is released or expires. */
  keyFor(intent: PaymentIntent): string;
  /** Call once the payment reached a final outcome. The next try for the same intent gets a new key. */
  release(intent: PaymentIntent): void;
}

function storageName(intent: PaymentIntent): string {
  return `gg:pay:key:${intentFingerprint(intent)}`;
}

function readStored(raw: string | null): { key: string; createdAt: number } | null {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null && "key" in value && "createdAt" in value) {
      const { key, createdAt } = value as { key: unknown; createdAt: unknown };
      if (typeof key === "string" && typeof createdAt === "number" && idempotencyKeySchema.safeParse(key).success) {
        return { key, createdAt };
      }
    }
  } catch {
    // corrupt value, replaced below
  }
  return null;
}

export function createIntentKeys(deps: IntentKeysDeps): IntentKeys {
  const ttl = deps.ttlMs ?? KEY_TTL_MS;
  return {
    keyFor(intent) {
      const name = storageName(intent);
      const now = deps.now();
      const existing = readStored(deps.store.get(name));
      if (existing !== null && now - existing.createdAt >= 0 && now - existing.createdAt < ttl) {
        return existing.key;
      }
      const key = `gg_${deps.newId()}`;
      if (!idempotencyKeySchema.safeParse(key).success) {
        throw new RangeError("Generated idempotency key does not satisfy the contract.");
      }
      deps.store.set(name, JSON.stringify({ key, createdAt: now }));
      return key;
    },
    release(intent) {
      deps.store.remove(storageName(intent));
    },
  };
}
