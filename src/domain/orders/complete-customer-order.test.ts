import { describe, expect, it } from "vitest";
import { removePurchasedLinesFromCart } from "@/domain/orders/complete-customer-order";

describe("removePurchasedLinesFromCart", () => {
  it("removes products that were fully purchased", () => {
    expect(removePurchasedLinesFromCart(
      { "BND-001-KIT": 1 },
      [{ variantId: "BND-001-KIT", quantity: 1 }],
    )).toEqual({});
  });

  it("preserves quantities added after the confirmed cart snapshot", () => {
    expect(removePurchasedLinesFromCart(
      { "CLN-001-100ML": 3 },
      [{ variantId: "CLN-001-100ML", quantity: 2 }],
    )).toEqual({ "CLN-001-100ML": 1 });
  });

  it("does not alter unrelated cart products", () => {
    expect(removePurchasedLinesFromCart(
      { "BND-001-KIT": 1, "SRM-001-15ML": 1 },
      [{ variantId: "BND-001-KIT", quantity: 1 }],
    )).toEqual({ "SRM-001-15ML": 1 });
  });
});
