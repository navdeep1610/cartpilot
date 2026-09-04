import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { selectOffer } from "@/domain/offers/select-offer";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { assertOfferDecisionSchema, toOfferDecisionSchema } from "./validate-offer-decision";

let snapshot: CatalogSnapshot;

beforeAll(async () => {
  snapshot = await loadCatalogSnapshot();
});

describe("offer decision schema", () => {
  it("validates the complete deterministic candidate decision against the declared schema", () => {
    const intent = extractFallbackIntent(
      "I have oily skin and clogged pores and want a simple routine",
    );
    const decision = selectOffer(
      snapshot,
      [
        { variantId: "CLN-002-100ML", quantity: 1 },
        { variantId: "SRM-001-15ML", quantity: 1 },
      ],
      intent,
    );

    expect(() =>
      assertOfferDecisionSchema(snapshot, decision, intent, "SES-00000000-0000-0000-0000-000000000000"),
    ).not.toThrow();
    const schemaDecision = toOfferDecisionSchema(
      snapshot,
      decision,
      intent,
      "SES-00000000-0000-0000-0000-000000000000",
    );
    expect(schemaDecision.catalog_version).toBe("1.1.0");
    expect(schemaDecision.decision_status).toBe("selected");
  });
});
