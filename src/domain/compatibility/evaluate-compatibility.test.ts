import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { evaluateCompatibility } from "./evaluate-compatibility";

let snapshot: CatalogSnapshot;

beforeAll(async () => {
  snapshot = await loadCatalogSnapshot();
});

describe("evaluateCompatibility", () => {
  it("fails closed when any proposed product pair has no declared relationship", () => {
    const result = evaluateCompatibility(snapshot, ["CLN-001", "LIP-001"]);
    expect(result.decision).toBe("clarify");
    expect(result.unmatchedPairs).toEqual([
      { firstProductId: "CLN-001", secondProductId: "LIP-001" },
    ]);
  });

  it("allows a fully declared starter bundle relationship set", () => {
    const result = evaluateCompatibility(snapshot, ["CLN-002", "SRM-001", "MST-001"]);
    expect(result.decision).toBe("allow");
    expect(result.unmatchedPairs).toEqual([]);
    expect(result.matchedRuleIds).toEqual(expect.arrayContaining(["PCR-015", "PCR-090", "PCR-091"]));
  });
});
