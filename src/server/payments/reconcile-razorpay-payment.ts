import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import type { RazorpayTestPaymentEvidence } from "@/server/payments/razorpay-test-adapter";

export interface PaymentReconciliationDecision {
  evidenceMatched: boolean;
  status: "captured" | "authorized" | "failed" | "refunded" | "pending" | "mismatch";
  nextState: string;
  reasonCode: string;
  message: string;
  update: Record<string, unknown> | null;
}

export function reconcileRazorpayPayment(
  record: StoredPaymentRecord,
  evidence: RazorpayTestPaymentEvidence,
): PaymentReconciliationDecision {
  const identifiersAndMoneyMatch =
    evidence.payment.id === record.razorpay_payment_id &&
    evidence.payment.orderId === record.razorpay_order_id &&
    evidence.order.id === record.razorpay_order_id &&
    evidence.payment.amountPaise === record.amount_paise &&
    evidence.order.amountPaise === record.amount_paise &&
    evidence.payment.currency === record.currency &&
    evidence.order.currency === record.currency;

  if (!identifiersAndMoneyMatch) {
    return {
      evidenceMatched: false,
      status: "mismatch",
      nextState: record.state,
      reasonCode: "RAZORPAY_API_EVIDENCE_MISMATCH",
      message: "Razorpay returned details that do not match this Supabase order. Fulfilment remains blocked.",
      update: null,
    };
  }

  if (evidence.payment.status === "captured" && evidence.payment.captured) {
    const orderPaid =
      evidence.order.status === "paid" &&
      evidence.order.amountPaidPaise === record.amount_paise &&
      evidence.order.amountDuePaise === 0;
    return {
      evidenceMatched: true,
      status: "captured",
      nextState: "payment_captured",
      reasonCode: orderPaid ? "API_CAPTURE_AND_ORDER_RECONCILED" : "API_CAPTURE_CONFIRMED_ORDER_PENDING",
      message: orderPaid
        ? "Razorpay confirmed the captured payment and paid order. This test order is ready to pack."
        : "Razorpay confirmed capture, but the order is not marked paid yet. Fulfilment remains blocked.",
      update: {
        state: "payment_captured",
        razorpay_order_status: evidence.order.status,
        razorpay_payment_id: evidence.payment.id,
        capture_confirmed: true,
        capture_confirmation_source: "razorpay_api_recheck",
        fulfilment_authorized: orderPaid,
        failure_code: null,
      },
    };
  }

  if (evidence.payment.status === "failed") {
    return {
      evidenceMatched: true,
      status: "failed",
      nextState: "payment_failed",
      reasonCode: "API_PAYMENT_FAILED_CONFIRMED",
      message: "Razorpay confirmed that this test payment failed. Fulfilment remains blocked.",
      update: {
        state: "payment_failed",
        razorpay_order_status: evidence.order.status,
        razorpay_payment_id: evidence.payment.id,
        fulfilment_authorized: false,
        failure_code: "PAYMENT_FAILED",
      },
    };
  }

  if (evidence.payment.status === "refunded") {
    return {
      evidenceMatched: true,
      status: "refunded",
      nextState: "cancelled",
      reasonCode: "API_PAYMENT_REFUNDED_CONFIRMED",
      message: "Razorpay reports that this payment was refunded. Fulfilment remains blocked.",
      update: {
        state: "cancelled",
        razorpay_order_status: evidence.order.status,
        razorpay_payment_id: evidence.payment.id,
        fulfilment_authorized: false,
        failure_code: "PAYMENT_REFUNDED",
      },
    };
  }

  if (evidence.payment.status === "authorized") {
    return {
      evidenceMatched: true,
      status: "authorized",
      nextState: "payment_authorized",
      reasonCode: "API_PAYMENT_AUTHORIZED_CAPTURE_PENDING",
      message: "Razorpay has authorized the payment, but capture is still pending. Fulfilment remains blocked.",
      update: {
        state: "payment_authorized",
        razorpay_order_status: evidence.order.status,
        razorpay_payment_id: evidence.payment.id,
        fulfilment_authorized: false,
        failure_code: null,
      },
    };
  }

  return {
    evidenceMatched: true,
    status: "pending",
    nextState: record.state,
    reasonCode: "API_PAYMENT_NOT_COMPLETED",
    message: "Razorpay has not completed this payment yet. Fulfilment remains blocked.",
    update: null,
  };
}
