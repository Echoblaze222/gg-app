/**
 * Response bodies copied from Paystack's official API reference samples
 * (https://paystack.com/docs/api/transaction/), read 2026-11-14.
 * The docs mask the email address, so a neutral example address is used here.
 */

export const INITIALIZE_OK = {
  status: true,
  message: "Authorization URL created",
  data: {
    authorization_url: "https://checkout.paystack.com/3ni8kdavz62431k",
    access_code: "3ni8kdavz62431k",
    reference: "re4lyvq3s3",
  },
};

const AUTHORIZATION = {
  authorization_code: "AUTH_uh8bcl3zbn",
  bin: "408408",
  last4: "4081",
  exp_month: "12",
  exp_year: "2030",
  channel: "card",
  card_type: "visa ",
  bank: "TEST BANK",
  country_code: "NG",
  brand: "visa",
  reusable: true,
  signature: "SIG_yEXu7dLBeqG0kU7g95Ke",
  account_name: null,
};

const CUSTOMER = {
  id: 181873746,
  first_name: null,
  last_name: null,
  email: "customer@example.com",
  customer_code: "CUS_1rkzaqsv4rrhqo6",
  phone: null,
  metadata: null,
  risk_action: "default",
  international_format_phone: null,
};

/** Verify sample. Note amount 40333 = requested_amount 30050 + fees 10283 (fees passed to the customer). */
export const VERIFY_SUCCESS = {
  status: true,
  message: "Verification successful",
  data: {
    id: 4099260516,
    domain: "test",
    status: "success",
    reference: "re4lyvq3s3",
    receipt_number: null,
    amount: 40333,
    message: null,
    gateway_response: "Successful",
    paid_at: "2024-08-22T09:15:02.000Z",
    created_at: "2024-08-22T09:14:24.000Z",
    channel: "card",
    currency: "NGN",
    ip_address: "197.210.54.33",
    metadata: "",
    log: { start_time: 1724318098, time_spent: 4, attempts: 1, errors: 0, success: true, mobile: false, input: [], history: [] },
    fees: 10283,
    fees_split: null,
    authorization: AUTHORIZATION,
    customer: CUSTOMER,
    plan: null,
    split: {},
    order_id: null,
    paidAt: "2024-08-22T09:15:02.000Z",
    createdAt: "2024-08-22T09:14:24.000Z",
    requested_amount: 30050,
    pos_transaction_data: null,
    source: null,
    fees_breakdown: null,
    connect: null,
    transaction_date: "2024-08-22T09:14:24.000Z",
    plan_object: {},
    subaccount: {},
  },
};

/** Charge authorization sample. The docs sample shows no authorization_url on this path. */
export const CHARGE_AUTHORIZATION_OK = {
  status: true,
  message: "Charge attempted",
  data: {
    amount: 35247,
    currency: "NGN",
    transaction_date: "2024-08-22T10:53:49.000Z",
    status: "success",
    reference: "0m7frfnr47ezyxl",
    domain: "test",
    metadata: "",
    gateway_response: "Approved",
    message: null,
    channel: "card",
    ip_address: null,
    log: null,
    fees: 10247,
    authorization: AUTHORIZATION,
    customer: CUSTOMER,
    plan: null,
    id: 4099490251,
  },
};

/**
 * A challenged charge. The redirect shape is described in the recurring charges guide but no full
 * sample body is published, so this is a minimal assumed shape. The sandbox suite must confirm it.
 */
export const CHARGE_AUTHORIZATION_REDIRECT_ASSUMED = {
  status: true,
  message: "Charge attempted",
  data: {
    reference: "0m7frfnr47ezyxl",
    status: "pending",
    paused: true,
    authorization_url: "https://checkout.paystack.com/abc123xyz",
  },
};

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
