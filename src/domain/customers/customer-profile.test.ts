import { describe, expect, it } from "vitest";
import { normalizeCustomerProfile, profilesMatch } from "@/domain/customers/customer-profile";

describe("customer profile", () => {
  it("normalizes a complete customer profile", () => {
    expect(normalizeCustomerProfile({
      name: "  Demo Shopper  ",
      email: " Shopper@Example.com ",
      phone: "+91 98765 43210",
      deliveryAddress: " 21 Demo Street, New Delhi ",
    })).toEqual({
      name: "Demo Shopper",
      email: "shopper@example.com",
      phone: "+91 98765 43210",
      deliveryAddress: "21 Demo Street, New Delhi",
    });
  });

  it("rejects incomplete contact or delivery details", () => {
    expect(normalizeCustomerProfile({ name: "A", email: "bad", phone: "123", deliveryAddress: "Short" })).toBeNull();
  });

  it("detects whether checkout details still match the stored profile", () => {
    const stored = {
      name: "Demo Shopper",
      email: "shopper@example.com",
      phone: "+91 98765 43210",
      deliveryAddress: "21 Demo Street, New Delhi",
    };
    expect(profilesMatch(stored, { ...stored })).toBe(true);
    expect(profilesMatch(stored, { ...stored, deliveryAddress: "99 New Address, New Delhi" })).toBe(false);
  });
});
