import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { calculateProfit } from "./calculate-profit";

let snapshot: CatalogSnapshot;

beforeAll(async () => {
  snapshot = await loadCatalogSnapshot();
});

describe("calculateProfit", () => {
  it("reconciles the worked toner example using integer paise", () => {
    const result = calculateProfit(snapshot, [{ variantId: "TON-001-100ML", quantity: 1 }]);
    expect(result.netRevenuePaise).toBe(34_900);
    expect(result.productCostPaise).toBe(12_000);
    expect(result.expectedReturnCostPaise).toBe(240);
    expect(result.estimatedPaymentCostPaise).toBe(698);
    expect(result.contributionProfitPaise).toBe(16_662);
    expect(result.contributionMarginBps).toBe(4_774);
  });
});
