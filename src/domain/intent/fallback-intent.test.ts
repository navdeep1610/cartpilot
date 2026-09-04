import { describe, expect, it } from "vitest";
import { extractFallbackIntent } from "./fallback-intent";

describe("extractFallbackIntent", () => {
  it("keeps explicit product and ingredient exclusions in deterministic fallback intent", () => {
    const intent = extractFallbackIntent(
      "Build a routine without serum and avoid retinol for my dry skin.",
    );
    expect(intent.productTypeExclusions).toContain("serum");
    expect(intent.ingredientExclusions).toContain("retinoid_or_retinol");
  });
});
