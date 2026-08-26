import { describe, expect, it } from "vitest";
import { merchantEmailMatches, safeMerchantDestination } from "@/server/auth/merchant-auth-utils";

describe("merchant authorization helpers", () => {
  it("matches the configured merchant email without case sensitivity", () => {
    expect(merchantEmailMatches("Merchant@Example.com", " merchant@example.com ")).toBe(true);
  });

  it("rejects missing and different merchant identities", () => {
    expect(merchantEmailMatches(null, "merchant@example.com")).toBe(false);
    expect(merchantEmailMatches("other@example.com", "merchant@example.com")).toBe(false);
  });

  it("allows only local merchant destinations after login", () => {
    expect(safeMerchantDestination("/merchant/customers")).toBe("/merchant/customers");
    expect(safeMerchantDestination("https://example.com")).toBe("/merchant");
    expect(safeMerchantDestination("//example.com/merchant")).toBe("/merchant");
    expect(safeMerchantDestination("/merchant/login?next=/merchant")).toBe("/merchant");
  });
});
