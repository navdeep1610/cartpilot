export type VerifiedPaymentEvent = "payment.authorized" | "payment.captured" | "payment.failed" | "order.paid";

export interface PaymentAuthorityState {
  state: string;
  captureConfirmed: boolean;
  orderPaid: boolean;
  fulfilmentAuthorized: boolean;
}

export interface PaymentAuthorityTransition extends PaymentAuthorityState {
  applied: boolean;
  reasonCode: string;
  fulfilmentOpened: boolean;
}

const supportedEvents = new Set<VerifiedPaymentEvent>([
  "payment.authorized",
  "payment.captured",
  "payment.failed",
  "order.paid",
]);

export function isVerifiedPaymentEvent(value: string): value is VerifiedPaymentEvent {
  return supportedEvents.has(value as VerifiedPaymentEvent);
}

export function reducePaymentAuthority(
  current: PaymentAuthorityState,
  event: VerifiedPaymentEvent,
): PaymentAuthorityTransition {
  if (current.captureConfirmed && (event === "payment.authorized" || event === "payment.failed")) {
    return unchanged(current, "MONOTONIC_STATE_PROTECTED");
  }

  if (event === "payment.failed") {
    return result(current, {
      state: "payment_failed",
      captureConfirmed: false,
      orderPaid: current.orderPaid,
      fulfilmentAuthorized: false,
      reasonCode: "TEST_PAYMENT_FAILED_SAFELY",
    });
  }
  if (event === "payment.authorized") {
    return result(current, {
      state: "payment_authorized",
      captureConfirmed: false,
      orderPaid: current.orderPaid,
      fulfilmentAuthorized: false,
      reasonCode: "PAYMENT_AUTHORIZED_CAPTURE_PENDING",
    });
  }
  if (event === "payment.captured") {
    return result(current, {
      state: "payment_captured",
      captureConfirmed: true,
      orderPaid: current.orderPaid,
      fulfilmentAuthorized: current.orderPaid,
      reasonCode: current.orderPaid ? "CAPTURE_AND_ORDER_RECONCILED" : "CAPTURE_CONFIRMED_ORDER_STATUS_PENDING",
    });
  }
  return result(current, {
    state: current.captureConfirmed ? "payment_captured" : current.state,
    captureConfirmed: current.captureConfirmed,
    orderPaid: true,
    fulfilmentAuthorized: current.captureConfirmed,
    reasonCode: current.captureConfirmed ? "CAPTURE_AND_ORDER_RECONCILED" : "ORDER_PAID_CAPTURE_PENDING",
  });
}

function unchanged(current: PaymentAuthorityState, reasonCode: string): PaymentAuthorityTransition {
  return { ...current, applied: false, reasonCode, fulfilmentOpened: false };
}

function result(
  current: PaymentAuthorityState,
  next: PaymentAuthorityState & { reasonCode: string },
): PaymentAuthorityTransition {
  return {
    ...next,
    applied: true,
    fulfilmentOpened: !current.fulfilmentAuthorized && next.fulfilmentAuthorized,
  };
}
