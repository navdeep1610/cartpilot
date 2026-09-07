import { describe, expect, it } from "vitest";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import {
  isPaymentRetryAllowed,
  PAYMENT_RETRY_WINDOW_MS,
  requiresFreshPaymentRecord,
  retryWindowEndsAt,
} from "@/server/payments/payment-retry-window";

describe("five-minute payment retry window", () => {
  const failedAt = Date.parse("2026-09-07T10:00:00.000Z");

  it("keeps a failed payment retryable until the deadline", () => {
    const record = paymentRecord({ updated_at: new Date(failedAt).toISOString() });
    expect(retryWindowEndsAt(record)).toBe(failedAt + PAYMENT_RETRY_WINDOW_MS);
    expect(isPaymentRetryAllowed(record, failedAt + PAYMENT_RETRY_WINDOW_MS - 1)).toBe(true);
    expect(requiresFreshPaymentRecord(record, failedAt + PAYMENT_RETRY_WINDOW_MS - 1)).toBe(false);
  });

  it("requires a fresh payment record when the retry deadline is reached", () => {
    const record = paymentRecord({ updated_at: new Date(failedAt).toISOString() });
    expect(isPaymentRetryAllowed(record, failedAt + PAYMENT_RETRY_WINDOW_MS)).toBe(false);
    expect(requiresFreshPaymentRecord(record, failedAt + PAYMENT_RETRY_WINDOW_MS)).toBe(true);
  });

  it("requires immediate replacement for a checkout timeout", () => {
    const record = paymentRecord({ failure_code: "PAYMENT_TIMEOUT_5M" });
    expect(isPaymentRetryAllowed(record, failedAt)).toBe(false);
    expect(requiresFreshPaymentRecord(record, failedAt)).toBe(true);
  });

  it("never permits retry after capture", () => {
    const record = paymentRecord({ capture_confirmed: true, fulfilment_authorized: true });
    expect(isPaymentRetryAllowed(record, failedAt)).toBe(false);
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
    amount_paise: 34900,
    currency: "INR",
    mode: "test",
    state: "payment_failed",
    razorpay_order_id: "order_test123",
    razorpay_order_status: "attempted",
    razorpay_payment_id: "pay_test123",
    order_receipt: "ORD-TEST-12345678",
    callback_verified: false,
    capture_confirmed: false,
    capture_confirmation_source: null,
    fulfilment_authorized: false,
    failure_code: "PAYMENT_FAILED",
    order_creation_claimed_at: "2026-09-07T09:59:00.000Z",
    confirmation_idempotency_key: "confirm:test-12345678",
    order_creation_idempotency_key: "order:test-12345678",
    callback_idempotency_key: null,
    state_version: 4,
    manual_review_required: false,
    last_retry_idempotency_key: null,
    payment_retry_count: 0,
    customer_confirmed_at: "2026-09-07T09:59:00.000Z",
    created_at: "2026-09-07T09:59:00.000Z",
    updated_at: "2026-09-07T10:00:00.000Z",
    ...overrides,
  };
}
