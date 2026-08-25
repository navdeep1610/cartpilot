import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PaymentConfigurationError,
  verifyRazorpayPaymentCallback,
  verifyRazorpayWebhook,
} from "./razorpay-test-adapter";

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env.RAZORPAY_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_cartpilot";
  process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
});

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Razorpay Test Mode verification", () => {
  it("accepts only the correct checkout callback signature", () => {
    const orderId = "order_test_123";
    const paymentId = "pay_test_456";
    const signature = createHmac("sha256", "test-key-secret")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    expect(verifyRazorpayPaymentCallback({ orderId, paymentId, signature })).toBe(true);
    expect(verifyRazorpayPaymentCallback({ orderId, paymentId, signature: "0".repeat(64) })).toBe(false);
  });

  it("verifies the exact raw webhook body", () => {
    const body = '{"event":"payment.captured"}';
    const signature = createHmac("sha256", "test-webhook-secret").update(body).digest("hex");
    expect(verifyRazorpayWebhook(body, signature)).toBe(true);
    expect(verifyRazorpayWebhook(`${body}\n`, signature)).toBe(false);
  });

  it("rejects live-mode-looking credentials", () => {
    process.env.RAZORPAY_KEY_ID = "rzp_live_not_allowed";
    expect(() => verifyRazorpayPaymentCallback({
      orderId: "order_test_123",
      paymentId: "pay_test_456",
      signature: "0".repeat(64),
    })).toThrow(PaymentConfigurationError);
  });
});
