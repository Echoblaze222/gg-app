/**
 * A scriptable in memory PaymentProvider for tests. Lives under tests/ on purpose (shared rule 4):
 * no production path may ever import it.
 *
 * Defaults mirror real provider behaviour:
 * - initialize records an unpaid transaction, which verify reports as "abandoned" (Paystack's word for it).
 * - chargeAuthorization records a successful card transaction and answers "submitted".
 * - verify of a reference we never saw is "not_found".
 * Queue a result to override the next call of that kind.
 */
import {
  providerFail,
  providerOk,
  type ChargeAuthorizationInput,
  type ChargeOutcome,
  type InitializeInput,
  type InitializeResult,
  type PaymentProvider,
  type ProviderAuthorization,
  type ProviderResult,
  type ProviderTransaction,
} from "@/lib/payments/provider/types";

export type FakeCall =
  | { readonly method: "initialize"; readonly input: InitializeInput }
  | { readonly method: "verify"; readonly reference: string }
  | { readonly method: "chargeAuthorization"; readonly input: ChargeAuthorizationInput };

export const FAKE_AUTHORIZATION: ProviderAuthorization = {
  authorizationCode: "AUTH_fake00001",
  signature: "SIG_fake00001",
  last4: "4081",
  expMonth: "12",
  expYear: "2030",
  brand: "visa",
  cardType: "visa",
  bank: "TEST BANK",
  countryCode: "NG",
  channel: "card",
  reusable: true,
};

export function makeTransaction(reference: string, amountKobo: number, status: string, patch: Partial<ProviderTransaction> = {}): ProviderTransaction {
  return {
    providerTransactionId: String(4_000_000_000 + Math.abs(hash(reference))),
    reference,
    status,
    amountKobo,
    requestedAmountKobo: null,
    feesKobo: null,
    currency: "NGN",
    channel: "card",
    gatewayResponse: status === "success" ? "Successful" : null,
    paidAt: status === "success" ? "2026-11-14T09:00:00.000Z" : null,
    authorization: null,
    customerEmail: "member@example.com",
    ...patch,
  };
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

export class FakeProvider implements PaymentProvider {
  readonly calls: FakeCall[] = [];
  private readonly transactions = new Map<string, ProviderTransaction>();
  private readonly initializeQueue: Array<ProviderResult<InitializeResult>> = [];
  private readonly verifyQueue: Array<ProviderResult<ProviderTransaction>> = [];
  private readonly chargeQueue: Array<ProviderResult<ChargeOutcome>> = [];

  // Scripting

  queueInitialize(result: ProviderResult<InitializeResult>): this {
    this.initializeQueue.push(result);
    return this;
  }
  queueVerify(result: ProviderResult<ProviderTransaction>): this {
    this.verifyQueue.push(result);
    return this;
  }
  queueCharge(result: ProviderResult<ChargeOutcome>): this {
    this.chargeQueue.push(result);
    return this;
  }

  /** Sets what verify reports for a reference. Creates the transaction if needed. */
  setTransaction(reference: string, amountKobo: number, status: string, patch: Partial<ProviderTransaction> = {}): this {
    this.transactions.set(reference, makeTransaction(reference, amountKobo, status, patch));
    return this;
  }
  /** Marks a known reference as paid, with a reusable card unless told otherwise. */
  succeed(reference: string, patch: Partial<ProviderTransaction> = {}): this {
    const known = this.transactions.get(reference);
    if (!known) throw new Error(`FakeProvider: unknown reference ${reference}`);
    this.transactions.set(reference, makeTransaction(reference, known.amountKobo, "success", { authorization: FAKE_AUTHORIZATION, ...patch }));
    return this;
  }
  /** Moves a known reference to another status, keeping its amount. */
  setStatus(reference: string, status: string, patch: Partial<ProviderTransaction> = {}): this {
    const known = this.transactions.get(reference);
    if (!known) throw new Error(`FakeProvider: unknown reference ${reference}`);
    this.transactions.set(reference, { ...known, status, ...patch });
    return this;
  }
  known(reference: string): ProviderTransaction | undefined {
    return this.transactions.get(reference);
  }
  callsTo(method: FakeCall["method"]): FakeCall[] {
    return this.calls.filter((c) => c.method === method);
  }

  // PaymentProvider

  async initialize(input: InitializeInput): Promise<ProviderResult<InitializeResult>> {
    this.calls.push({ method: "initialize", input });
    const queued = this.initializeQueue.shift();
    if (queued) return queued;
    this.transactions.set(input.reference, makeTransaction(input.reference, input.amountKobo, "abandoned"));
    return providerOk({
      authorizationUrl: `https://checkout.paystack.com/fake-${input.reference.slice(-8)}`,
      accessCode: `fake-${input.reference.slice(-8)}`,
      reference: input.reference,
    });
  }

  async verify(reference: string): Promise<ProviderResult<ProviderTransaction>> {
    this.calls.push({ method: "verify", reference });
    const queued = this.verifyQueue.shift();
    if (queued) return queued;
    const known = this.transactions.get(reference);
    return known ? providerOk(known) : providerFail("not_found", 404);
  }

  async chargeAuthorization(input: ChargeAuthorizationInput): Promise<ProviderResult<ChargeOutcome>> {
    this.calls.push({ method: "chargeAuthorization", input });
    const queued = this.chargeQueue.shift();
    if (queued) return queued;
    this.transactions.set(input.reference, makeTransaction(input.reference, input.amountKobo, "success", { authorization: FAKE_AUTHORIZATION }));
    return providerOk({ kind: "submitted", reference: input.reference, statusHint: "success" });
  }
}
