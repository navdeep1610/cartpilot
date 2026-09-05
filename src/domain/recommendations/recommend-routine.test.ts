import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { recommendRoutine } from "./recommend-routine";

let snapshot: CatalogSnapshot;

beforeAll(async () => {
  snapshot = await loadCatalogSnapshot();
});

describe("recommendRoutine", () => {
  it("builds an in-stock catalog routine for oily, clogged-pore concerns", () => {
    const result = recommendRoutine(
      snapshot,
      extractFallbackIntent("I have oily skin and clogged pores. Build a simple routine."),
    );
    expect(result.status).toBe("ready");
    expect(result.items.length).toBeGreaterThanOrEqual(3);
    expect(result.items.some((item) => item.productId === "CLN-002")).toBe(true);
    expect(result.items.every((item) => snapshot.products.has(item.productId))).toBe(true);
  });

  it("never recommends an explicitly excluded product type or ingredient", () => {
    const result = recommendRoutine(
      snapshot,
      extractFallbackIntent("Build a dry-skin routine without serum and avoid retinol"),
    );
    expect(result.items.every((item) => item.productType.toLowerCase() !== "serum")).toBe(true);
    expect(result.items.every((item) => item.productId !== "SRM-005")).toBe(true);
  });

  it("honors explicitly requested routine steps within the stated budget", () => {
    const result = recommendRoutine(
      snapshot,
      extractFallbackIntent("I need a hydrating toner and something to cleanse my dry skin under ₹1,000"),
    );

    expect(result.items.map((item) => item.productId)).toEqual(["CLN-001", "TON-001"]);
    expect(result.items.reduce((total, item) => total + item.pricePaise, 0)).toBeLessThanOrEqual(100_000);
  });

  it("pairs a dry-skin retinol request with a compatible moisturizer", () => {
    const result = recommendRoutine(
      snapshot,
      extractFallbackIntent("I want to start retinol but my skin becomes dry under ₹1,400"),
    );

    expect(result.items.map((item) => item.productId)).toEqual(["SRM-005", "MST-002"]);
  });
});
