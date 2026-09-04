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

  it("rejects a prepriced bundle when any required component is out of stock", () => {
    const variants = new Map(snapshot.variants);
    const moisturizer = variants.get("MST-001-50G");
    if (!moisturizer) throw new Error("Missing bundle component fixture");
    variants.set(moisturizer.variantId, { ...moisturizer, stockQuantity: 0 });
    const changedSnapshot: CatalogSnapshot = { ...snapshot, variants };

    const decision = selectOffer(
      changedSnapshot,
      [
        { variantId: "CLN-002-100ML", quantity: 1 },
        { variantId: "SRM-001-15ML", quantity: 1 },
      ],
      extractFallbackIntent("I have oily skin and clogged pores and want a simple routine"),
    );
    const bundle = decision.candidates.find((candidate) => candidate.bundleProductId === "BND-001");
    expect(bundle?.status).toBe("rejected");
    expect(bundle?.rejectionReasonCodes).toContain("BUNDLE_COMPONENT_UNAVAILABLE");

    const directBundleDecision = selectOffer(
      changedSnapshot,
      [{ variantId: "BND-001-KIT", quantity: 1 }],
      extractFallbackIntent("Review my cart"),
    );
    expect(directBundleDecision.candidates[0].status).toBe("rejected");
    expect(directBundleDecision.candidates[0].rejectionReasonCodes).toContain(
      "BUNDLE_COMPONENT_UNAVAILABLE",
    );
  });

  it("rejects candidates that conflict with an explicit ingredient exclusion", () => {
    const decision = selectOffer(
      snapshot,
      [
        { variantId: "CLN-002-100ML", quantity: 1 },
        { variantId: "SRM-001-15ML", quantity: 1 },
      ],
      extractFallbackIntent("Build an oily-skin routine but avoid niacinamide"),
    );
    const bundle = decision.candidates.find((candidate) => candidate.bundleProductId === "BND-001");
    expect(bundle?.rejectionReasonCodes).toContain("CUSTOMER_EXCLUSION_MATCH");
  });

  it("does not add a dynamic or threshold discount to a prepriced bundle", () => {
    const decision = selectOffer(
      snapshot,
      [{ variantId: "BND-001-KIT", quantity: 1 }],
      extractFallbackIntent("Can I get a discount on this bundle?"),
    );
    expect(decision.candidates).toHaveLength(1);
    expect(decision.candidates[0].customerSavingPaise).toBe(0);
  });

  it("rejects a cross-sell when another cart relationship is unknown", () => {
    const decision = selectOffer(
      snapshot,
      [
        { variantId: "TON-001-100ML", quantity: 1 },
        { variantId: "LIP-001-4P5G", quantity: 1 },
      ],
      extractFallbackIntent("Review my cart"),
    );
    const cleanserCrossSell = decision.candidates.find(
      (candidate) =>
        candidate.candidateType === "compatible_cross_sell" &&
        candidate.addedProductIds.includes("CLN-001"),
    );
    expect(cleanserCrossSell?.status).toBe("rejected");
    expect(cleanserCrossSell?.rejectionReasonCodes).toContain("COMPATIBILITY_BLOCKED");
  });
});
