import { describe, expect, it } from "vitest";
import { parsePersistedCart, serializePersistedCart } from "@/domain/cart/persisted-cart";

describe("persisted cart", () => {
  const variants = new Set(["BND-001-KIT", "CLN-001-100ML"]);

  it("restores valid cart quantities", () => {
    const serialized = serializePersistedCart({ "BND-001-KIT": 1, "CLN-001-100ML": 2 });

    expect(parsePersistedCart(serialized, variants)).toEqual({
      "BND-001-KIT": 1,
      "CLN-001-100ML": 2,
    });
  });

  it("drops unknown products and unsafe quantities", () => {
    const serialized = JSON.stringify({
      version: 1,
      items: {
        "BND-001-KIT": 99,
        "CLN-001-100ML": -1,
        "UNKNOWN-VARIANT": 1,
      },
    });

    expect(parsePersistedCart(serialized, variants)).toEqual({ "BND-001-KIT": 10 });
  });

  it("fails closed for malformed or outdated storage", () => {
    expect(parsePersistedCart("not-json", variants)).toEqual({});
    expect(parsePersistedCart(JSON.stringify({ version: 2, items: { "BND-001-KIT": 1 } }), variants)).toEqual({});
  });
});
