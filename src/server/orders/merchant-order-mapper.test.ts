import { describe, expect, it } from "vitest";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import { toMerchantOrder, type StoredAuditEvent } from "@/server/orders/merchant-order-mapper";

describe("toMerchantOrder", () => {
  it("maps a captured Supabase payment record into a fulfilment-ready order", () => {
    const record = paymentRecord({
      state: "payment_captured",
      callback_verified: true,
      capture_confirmed: true,
      fulfilment_authorized: true,
      razorpay_payment_id: "pay_test_123",
      confirmed_cart: {
        lines: [{
          variantId: "CLN-002-100ML",
          productId: "CLN-002",
          productName: "Salicylic Acid Cleanser",
          productType: "Cleanser",
          size: "100 ml",
          quantity: 1,
          unitPricePaise: 39900,
          lineDiscountPaise: 0,
          lineFinalPaise: 39900,
        }],
        grossPaise: 39900,
        savingPaise: 0,
        customer: {
          name: "Demo Shopper",
          email: "shopper@example.com",
          phone: "+91 98765 43210",
          deliveryAddress: "21 Demo Street, New Delhi",
        },
        offer: { candidateType: "cross_sell", acceptedEngineOffer: true },
      },
    });
    const audit: StoredAuditEvent = {
      audit_event_id: "AUD-TEST-12345678",
      trace_id: record.payment_record_id,
      event_type: "payment.webhook_applied",
      outcome: "success",
      reason_code: "CAPTURE_AND_ORDER_RECONCILED",
      created_at: "2026-08-25T09:05:00.000Z",
    };

    const order = toMerchantOrder(record, [audit]);

    expect(order.paymentStatus).toBe("paid");
    expect(order.fulfilmentStatus).toBe("ready_to_pack");
    expect(order.customer?.name).toBe("Demo Shopper");
    expect(order.lines[0]?.productName).toBe("Salicylic Acid Cleanser");
    expect(order.auditEvents).toHaveLength(1);
  });

  it("handles an earlier test order without customer or offer snapshots", () => {
    const record = paymentRecord({
      state: "order_created",
      confirmed_cart: {
        lines: [{
          variantId: "SRM-001-15ML",
          productId: "SRM-001",
          quantity: 1,
          unitPricePaise: 49900,
          lineDiscountPaise: 0,
          lineFinalPaise: 49900,
        }],
      },
    });

    const order = toMerchantOrder(record, []);

    expect(order.paymentStatus).toBe("awaiting_payment");
    expect(order.customer).toBeNull();
    expect(order.acceptedEngineOffer).toBeNull();
    expect(order.lines[0]?.productName).toBe("SRM-001");
  });

  it("labels the one-hour application timeout clearly", () => {
    const record = paymentRecord({
      state: "payment_failed",
      failure_code: "PAYMENT_TIMEOUT_1H",
    });

    const order = toMerchantOrder(record, []);

    expect(order.paymentStatus).toBe("failed");
    expect(order.paymentStatusLabel).toBe("Payment timed out");
    expect(order.fulfilmentStatus).toBe("blocked");
  });
});

function paymentRecord(overrides: Partial<StoredPaymentRecord>): StoredPaymentRecord {
  return {
    payment_record_id: "PAYREC-TEST-12345678",
    internal_order_id: "ORD-TEST-12345678",
    decision_id: "DECISION-TEST",
    session_id: "SESSION-TEST-12345678",
    cart_hash: "a".repeat(64),
    confirmed_cart: {},
    amount_paise: 39900,
    currency: "INR",
    mode: "test",
    state: "order_created",
    razorpay_order_id: "order_test_123",
    razorpay_order_status: "created",
    razorpay_payment_id: null,
    order_receipt: "ORD-TEST-12345678",
    callback_verified: false,
    capture_confirmed: false,
    capture_confirmation_source: null,
    fulfilment_authorized: false,
    failure_code: null,
    order_creation_claimed_at: "2026-08-25T09:00:00.000Z",
    customer_confirmed_at: "2026-08-25T09:00:00.000Z",
    created_at: "2026-08-25T09:00:00.000Z",
    updated_at: "2026-08-25T09:05:00.000Z",
    ...overrides,
  };
}
