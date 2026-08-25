import { describe, expect, it } from "vitest";
import { loadCatalogSnapshot } from "./file-catalog-repository";

describe("file catalog repository", () => {
  it("loads and validates every merchant catalog resource", async () => {
    const snapshot = await loadCatalogSnapshot();
    expect(snapshot.products.size).toBe(40);
    expect(snapshot.variants.size).toBe(74);
    expect(snapshot.economics.size).toBe(74);
    expect(snapshot.profiles.size).toBe(40);
    expect(snapshot.compatibilityRules).toHaveLength(89);
    expect(snapshot.bundleComponents).toHaveLength(15);
    expect(snapshot.profitPolicy.version).toBe("1.0.0");
    expect(snapshot.discountPolicy.version).toBe("1.0.0");
  });
});
