import { describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import type { RoutineRecommendation } from "@/domain/recommendations/recommend-routine";
import { buildShoppingAgentRun, suggestedAgentReplies } from "./shopping-agent-run";

const snapshot = {
  products: new Map([
    ["P-1", { productId: "P-1", status: "active" }],
    ["P-2", { productId: "P-2", status: "inactive" }],
  ]),
  variants: new Map([
    ["V-1", { variantId: "V-1", active: true, stockQuantity: 4 }],
    ["V-2", { variantId: "V-2", active: true, stockQuantity: 0 }],
  ]),
} as unknown as CatalogSnapshot;

const intent = {
  source: "gemini",
  budgetPaise: null,
  avoidStrongActives: false,
} as NormalizedCustomerIntent;

function recommendation(status: RoutineRecommendation["status"]): RoutineRecommendation {
  return {
    status,
    headline: "Result",
    summary: "Summary",
    items: status === "ready" ? ([{ productId: "P-1" }] as RoutineRecommendation["items"]) : [],
    compatibilityRuleIds: status === "ready" ? ["RULE-1"] : [],
    safetyNotes: status === "ready" ? ["Patch test"] : [],
    clarificationQuestion: status === "clarification_required" ? "What is your skin type?" : null,
  };
}

describe("shopping agent run", () => {
  it("separates AI interpretation from deterministic commercial authority", () => {
    const run = buildShoppingAgentRun("run-1", snapshot, intent, recommendation("ready"));

    expect(run.mode).toBe("gemini_assisted");
    expect(run.steps.map((step) => step.authority)).toEqual([
      "ai_assisted",
      "deterministic",
      "deterministic",
      "deterministic",
    ]);
    expect(run.steps[1].detail).toContain("1 active products and 1 in-stock variants");
    expect(run.steps[3].detail).toContain("checkout still requires explicit confirmation");
  });

  it("shows an honest pause and complete reply choices when clarification is required", () => {
    const result = recommendation("clarification_required");
    const run = buildShoppingAgentRun("run-2", snapshot, { ...intent, source: "deterministic_fallback" }, result);

    expect(run.mode).toBe("deterministic_fallback");
    expect(run.steps[2].status).toBe("needs_input");
    expect(run.steps[3].status).toBe("needs_input");
    expect(suggestedAgentReplies(result, intent)).toEqual([
      "Oily skin with clogged pores",
      "Dry skin with dehydration",
      "Sensitive skin with redness; avoid strong actives",
    ]);
  });

  it("marks medical and no-match outcomes as protected stops", () => {
    for (const status of ["professional_guidance", "no_match"] as const) {
      const run = buildShoppingAgentRun("run-protected", snapshot, intent, recommendation(status));
      expect(run.steps[2].status).toBe("protected");
      expect(run.steps[3].status).toBe("protected");
    }
  });
});
