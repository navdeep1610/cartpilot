import { describe, expect, it } from "vitest";
import { reducePaymentAuthority, type PaymentAuthorityState } from "./payment-transition-policy";

describe("verified payment authority", () => {
  it("opens fulfilment exactly when capture and paid-order evidence have both arrived", () => {
    const paidFirst = reducePaymentAuthority(initial(), "order.paid");
    expect(paidFirst.fulfilmentAuthorized).toBe(false);
    const captureSecond = reducePaymentAuthority(paidFirst, "payment.captured");
    expect(captureSecond).toMatchObject({ fulfilmentAuthorized: true, fulfilmentOpened: true });

    const captureFirst = reducePaymentAuthority(initial(), "payment.captured");
    expect(captureFirst.fulfilmentAuthorized).toBe(false);
    const paidSecond = reducePaymentAuthority(captureFirst, "order.paid");
    expect(paidSecond).toMatchObject({ fulfilmentAuthorized: true, fulfilmentOpened: true });
  });

  it("does not downgrade captured authority when an older failure arrives", () => {
    const captured = reducePaymentAuthority(
      { ...initial(), orderPaid: true },
      "payment.captured",
    );
    const lateFailure = reducePaymentAuthority(captured, "payment.failed");
    expect(lateFailure).toMatchObject({
      state: "payment_captured",
      fulfilmentAuthorized: true,
      applied: false,
      reasonCode: "MONOTONIC_STATE_PROTECTED",
    });
  });

  it("allows a late authorization after an earlier failed attempt", () => {
    const failed = reducePaymentAuthority(initial(), "payment.failed");
    const authorized = reducePaymentAuthority(failed, "payment.authorized");
    expect(authorized).toMatchObject({ state: "payment_authorized", applied: true, fulfilmentAuthorized: false });
  });
});

function initial(): PaymentAuthorityState {
  return { state: "order_created", captureConfirmed: false, orderPaid: false, fulfilmentAuthorized: false };
}
