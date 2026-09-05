import { describe, expect, it } from "vitest";
import {
  toCustomerOrder,
  type StoredCustomerOrderRecord,
} from "@/server/orders/customer-order-mapper";

describe("toCustomerOrder", () => {
  it("exposes a captured order with its immutable cart lines", () => {
    const order = toCustomerOrder(record());

    expect(order.orderId).toBe("ORD-TEST-12345678");
    expect(order.status).toBe("confirmed");
    expect(order.lines).toEqual([
      expect.objectContaining({
        variantId: "CLN-002-100ML",
        productName: "Salicylic Acid Cleanser",
        quantity: 2,
        lineTotalPaise: 79800,
      }),
    ]);
  });

  it("refuses to present an unverified payment as a completed order", () => {
    expect(() => toCustomerOrder(record({ fulfilment_authorized: false }))).toThrow(
      "captured payment and authorized fulfilment",
    );
  });

  it("drops malformed cart lines without exposing unsafe data", () => {
    const order = toCustomerOrder(record({
      confirmed_cart: { lines: [{ variantId: "", productId: "CLN-002", quantity: 1 }] },
    }));

    expect(order.lines).toEqual([]);
  });
});

function record(overrides: Partial<StoredCustomerOrderRecord> = {}): StoredCustomerOrderRecord {
  return {
    internal_order_id: "ORD-TEST-12345678",
    amount_paise: 79800,
    currency: "INR",
    mode: "test",
    state: "payment_captured",
    capture_confirmed: true,
    fulfilment_authorized: true,
    confirmed_cart: {
      lines: [{
        variantId: "CLN-002-100ML",
        productId: "CLN-002",
        productName: "Salicylic Acid Cleanser",
        productType: "Cleanser",
        size: "100 ml",
        quantity: 2,
        lineFinalPaise: 79800,
      }],
    },
    created_at: "2026-09-05T09:00:00.000Z",
    ...overrides,
  };
}
