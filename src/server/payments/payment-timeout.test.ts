import { describe, expect, it } from "vitest";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import { isPaymentTimedOut, PAYMENT_TIMEOUT_MS } from "@/server/payments/payment-timeout";

describe("isPaymentTimedOut", () => {
  const now = Date.parse("2026-08-25T12:00:00.000Z");

  it("expires an unpaid order after one hour", () => {
    const record = paymentRecord({ created_at: new Date(now - PAYMENT_TIMEOUT_MS).toISOString() });
    expect(isPaymentTimedOut(record, now)).toBe(true);
  });

  it("keeps an unpaid order open before one hour", () => {
    const record = paymentRecord({ created_at: new Date(now - PAYMENT_TIMEOUT_MS + 1).toISOString() });
    expect(isPaymentTimedOut(record, now)).toBe(false);
  });

  it("never times out a record that has payment evidence", () => {
    const record = paymentRecord({
      created_at: new Date(now - PAYMENT_TIMEOUT_MS * 2).toISOString(),
      razorpay_payment_id: "pay_test123",
      callback_verified: true,
      state: "callback_verified",
    });
    expect(isPaymentTimedOut(record, now)).toBe(false);
  });

  it("never times out a captured payment", () => {
    const record = paymentRecord({
      created_at: new Date(now - PAYMENT_TIMEOUT_MS * 2).toISOString(),
      state: "payment_captured",
      capture_confirmed: true,
      fulfilment_authorized: true,
    });
    expect(isPaymentTimedOut(record, now)).toBe(false);
  });
});

function paymentRecord(overrides: Partial<StoredPaymentRecord>): StoredPaymentRecord {
  return {
    payment_record_id: "PAYREC-TEST-12345678",
    trace_id: "TRACE-TEST-12345678",
    internal_order_id: "ORD-TEST-12345678",
    decision_id: "DECISION-TEST",
    session_id: "SESSION-TEST-12345678",
    cart_hash: "a".repeat(64),
    confirmed_cart: {},
    amount_paise: 164600,
    currency: "INR",
    mode: "test",
    state: "order_created",
    razorpay_order_id: "order_test123",
    razorpay_order_status: "created",
    razorpay_payment_id: null,
    order_receipt: "ORD-TEST-12345678",
    callback_verified: false,
    capture_confirmed: false,
    capture_confirmation_source: null,
    fulfilment_authorized: false,
    failure_code: null,
    order_creation_claimed_at: "2026-08-25T09:00:00.000Z",
    confirmation_idempotency_key: "confirm:test-12345678",
    order_creation_idempotency_key: "order:test-12345678",
    callback_idempotency_key: null,
    state_version: 3,
    manual_review_required: false,
    last_retry_idempotency_key: null,
    payment_retry_count: 0,
    customer_confirmed_at: "2026-08-25T09:00:00.000Z",
    created_at: "2026-08-25T09:00:00.000Z",
    updated_at: "2026-08-25T09:00:00.000Z",
    ...overrides,
  };
}
