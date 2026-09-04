import { describe, expect, it } from "vitest";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import type { RazorpayTestPaymentEvidence } from "@/server/payments/razorpay-test-adapter";
import { reconcileRazorpayPayment } from "@/server/payments/reconcile-razorpay-payment";

describe("reconcileRazorpayPayment", () => {
  it("opens fulfilment only when captured payment and paid order both reconcile", () => {
    const decision = reconcileRazorpayPayment(paymentRecord(), paymentEvidence());

    expect(decision.status).toBe("captured");
    expect(decision.update).toMatchObject({
      capture_confirmed: true,
      fulfilment_authorized: true,
      capture_confirmation_source: "razorpay_api_fetch",
    });
  });

  it("blocks fulfilment when any payment amount differs from Supabase", () => {
    const evidence = paymentEvidence();
    evidence.payment.amountPaise += 100;

    const decision = reconcileRazorpayPayment(paymentRecord(), evidence);

    expect(decision.status).toBe("mismatch");
    expect(decision.evidenceMatched).toBe(false);
    expect(decision.update).toBeNull();
  });

  it("keeps an authorized payment blocked until capture", () => {
    const evidence = paymentEvidence();
    evidence.payment.status = "authorized";
    evidence.payment.captured = false;
    evidence.order.status = "attempted";
    evidence.order.amountPaidPaise = 0;
    evidence.order.amountDuePaise = 164600;

    const decision = reconcileRazorpayPayment(paymentRecord(), evidence);

    expect(decision.status).toBe("authorized");
    expect(decision.update).toMatchObject({ fulfilment_authorized: false });
  });

  it("records a failed payment without authorizing fulfilment", () => {
    const evidence = paymentEvidence();
    evidence.payment.status = "failed";
    evidence.payment.captured = false;
    evidence.order.status = "attempted";
    evidence.order.amountPaidPaise = 0;
    evidence.order.amountDuePaise = 164600;

    const decision = reconcileRazorpayPayment(paymentRecord(), evidence);

    expect(decision.nextState).toBe("payment_failed");
    expect(decision.update).toMatchObject({ fulfilment_authorized: false });
  });
});

function paymentRecord(): StoredPaymentRecord {
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
    state: "callback_verified",
    razorpay_order_id: "order_test123",
    razorpay_order_status: "attempted",
    razorpay_payment_id: "pay_test123",
    order_receipt: "ORD-TEST-12345678",
    callback_verified: true,
    capture_confirmed: false,
    capture_confirmation_source: null,
    fulfilment_authorized: false,
    failure_code: null,
    order_creation_claimed_at: "2026-08-25T09:00:00.000Z",
    confirmation_idempotency_key: "confirm:test-12345678",
    order_creation_idempotency_key: "order:test-12345678",
    callback_idempotency_key: null,
    state_version: 4,
    manual_review_required: false,
    customer_confirmed_at: "2026-08-25T09:00:00.000Z",
    created_at: "2026-08-25T09:00:00.000Z",
    updated_at: "2026-08-25T09:05:00.000Z",
  };
}

function paymentEvidence(): RazorpayTestPaymentEvidence {
  return {
    payment: {
      id: "pay_test123",
      orderId: "order_test123",
      amountPaise: 164600,
      currency: "INR",
      status: "captured",
      captured: true,
    },
    order: {
      id: "order_test123",
      amountPaise: 164600,
      amountPaidPaise: 164600,
      amountDuePaise: 0,
      currency: "INR",
      status: "paid",
    },
  };
}
