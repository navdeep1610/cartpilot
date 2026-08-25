import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { findConfirmableCandidate, selectOffer } from "./select-offer";

let snapshot: CatalogSnapshot;

beforeAll(async () => {
  snapshot = await loadCatalogSnapshot();
});

describe("selectOffer", () => {
  it("selects the profit-positive acne starter bundle without randomness", () => {
    const decision = selectOffer(
      snapshot,
      [
        { variantId: "CLN-002-100ML", quantity: 1 },
        { variantId: "SRM-001-15ML", quantity: 1 },
      ],
      extractFallbackIntent("I have oily skin and clogged pores and want a simple routine"),
    );
    const selected = decision.candidates.find((candidate) => candidate.candidateId === decision.selectedCandidateId);
    expect(selected?.bundleProductId).toBe("BND-001");
    expect(selected?.profit.netRevenuePaise).toBe(129_900);
    expect(selected?.incrementalContributionProfitPaise).toBeGreaterThan(0);
    expect(decision.randomnessUsed).toBe(false);
    expect(decision.orderCreationAuthorized).toBe(false);

    const originalCart = findConfirmableCandidate(decision, decision.baselineCandidateId);
    expect(originalCart?.profit.netRevenuePaise).toBe(89_800);
    expect(originalCart?.profit.netRevenuePaise).not.toBe(selected?.profit.netRevenuePaise);
  });

  it("keeps the baseline when a price objection does not justify a discount", () => {
    const decision = selectOffer(
      snapshot,
      [{ variantId: "TON-001-100ML", quantity: 1 }],
      extractFallbackIntent("This toner is too expensive"),
    );
    expect(decision.selectedCandidateId).toBe(decision.baselineCandidateId);
    expect(decision.candidates.some((candidate) => candidate.discountRateBps > 0)).toBe(true);
  });

  it("allows confirmation of only the original cart or the explicitly offered candidate", () => {
    const decision = selectOffer(
      snapshot,
      [{ variantId: "CLN-001-100ML", quantity: 1 }],
      extractFallbackIntent("I want a gentle cleanser for dry skin"),
    );

    expect(findConfirmableCandidate(decision, decision.baselineCandidateId)).not.toBeNull();
    expect(findConfirmableCandidate(decision, decision.selectedCandidateId)).not.toBeNull();
    expect(findConfirmableCandidate(decision, "OFR-NOT-SHOWN-TO-CUSTOMER")).toBeNull();
  });
});
