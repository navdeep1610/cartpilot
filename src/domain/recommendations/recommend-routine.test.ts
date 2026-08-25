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
});
