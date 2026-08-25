import { describe, expect, it } from "vitest";
import { ceilRatio, inrToPaise, percentToBps, roundHalfUp } from "./money";

describe("money helpers", () => {
  it("converts INR and percentages into integer storage units", () => {
    expect(inrToPaise("349")).toBe(34_900);
    expect(inrToPaise("349.50")).toBe(34_950);
    expect(percentToBps("4")).toBe(400);
  });

  it("uses deterministic half-up and ceiling rounding", () => {
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(4, 2)).toBe(2);
    expect(ceilRatio(10n, 3n)).toBe(4);
  });
});
