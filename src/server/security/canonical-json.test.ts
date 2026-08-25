import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonicalJson } from "./canonical-json";

describe("canonical JSON", () => {
  it("produces the same hash regardless of object key insertion order", () => {
    const left = { total: 129900, cart: { b: 2, a: 1 } };
    const right = { cart: { a: 1, b: 2 }, total: 129900 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashCanonicalJson(left)).toBe(hashCanonicalJson(right));
    expect(hashCanonicalJson(left)).toMatch(/^[a-f0-9]{64}$/);
  });
});
