import type { CatalogSnapshot } from "@/domain/catalog/types";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import type { RoutineRecommendation } from "@/domain/recommendations/recommend-routine";

export type ShoppingAgentStepStatus = "complete" | "needs_input" | "protected";

export interface ShoppingAgentStep {
  stepId: "understand" | "catalog" | "safety" | "recommend";
  title: string;
  detail: string;
  status: ShoppingAgentStepStatus;
  authority: "ai_assisted" | "deterministic";
}

export interface ShoppingAgentRun {
  runId: string;
  mode: "gemini_assisted" | "deterministic_fallback";
  outcome: RoutineRecommendation["status"];
  steps: ShoppingAgentStep[];
  boundary: string;
}

export function buildShoppingAgentRun(
  runId: string,
  snapshot: CatalogSnapshot,
  intent: NormalizedCustomerIntent,
  recommendation: RoutineRecommendation,
): ShoppingAgentRun {
  const activeProducts = [...snapshot.products.values()].filter((product) => product.status === "active").length;
  const inStockVariants = [...snapshot.variants.values()].filter(
    (variant) => variant.active && variant.stockQuantity > 0,
  ).length;
  const needsInput = recommendation.status === "clarification_required";
  const protectedOutcome = ["professional_guidance", "no_match"].includes(recommendation.status);
  const safetyEvidenceCount = recommendation.compatibilityRuleIds.length + recommendation.safetyNotes.length;

  return {
    runId,
    mode: intent.source === "gemini" ? "gemini_assisted" : "deterministic_fallback",
    outcome: recommendation.status,
    steps: [
      {
        stepId: "understand",
        title: "Understand the request",
        detail:
          intent.source === "gemini"
            ? "Gemini converted the shopper's words into validated, structured intent."
            : "The local parser safely recovered structured intent without relying on the AI provider.",
        status: "complete",
        authority: intent.source === "gemini" ? "ai_assisted" : "deterministic",
      },
      {
        stepId: "catalog",
        title: "Read the live catalog",
        detail: `${activeProducts} active products and ${inStockVariants} in-stock variants were available for deterministic matching.`,
        status: "complete",
        authority: "deterministic",
      },
      {
        stepId: "safety",
        title: "Apply safety and shopper rules",
        detail: buildSafetyDetail(recommendation, safetyEvidenceCount),
        status: needsInput ? "needs_input" : protectedOutcome ? "protected" : "complete",
        authority: "deterministic",
      },
      {
        stepId: "recommend",
        title: "Build a bounded routine",
        detail: buildRecommendationDetail(recommendation),
        status: needsInput ? "needs_input" : protectedOutcome ? "protected" : "complete",
        authority: "deterministic",
      },
    ],
    boundary:
      "AI may interpret the request. Merchant code alone controls catalog eligibility, compatibility, inventory, prices, offers, orders and payments.",
  };
}

export function suggestedAgentReplies(
  recommendation: RoutineRecommendation,
  intent: NormalizedCustomerIntent,
): string[] {
  if (recommendation.status === "professional_guidance") return [];
  if (recommendation.status === "clarification_required") {
    return [
      "Oily skin with clogged pores",
      "Dry skin with dehydration",
      "Sensitive skin with redness; avoid strong actives",
    ];
  }
  if (recommendation.status === "no_match") {
    return ["Build a simple routine for normal skin", "Show a cleanser for oily skin"];
  }

  const replies: string[] = [];
  if (intent.budgetPaise === null) replies.push("Keep the routine under ₹1,500");
  if (!intent.avoidStrongActives) replies.push("Avoid strong actives");
  replies.push("Make it a simple routine");
  return replies.slice(0, 3);
}

function buildSafetyDetail(recommendation: RoutineRecommendation, evidenceCount: number): string {
  if (recommendation.status === "clarification_required") {
    return "The agent paused before matching products because one shopper detail is still needed.";
  }
  if (recommendation.status === "professional_guidance") {
    return "The medical-safety boundary stopped product selection and directed the shopper to professional guidance.";
  }
  if (recommendation.status === "no_match") {
    return "No eligible match passed every catalog and shopper constraint, so no product was invented.";
  }
  return `${evidenceCount} compatibility and safe-use evidence item${evidenceCount === 1 ? "" : "s"} support the result.`;
}

function buildRecommendationDetail(recommendation: RoutineRecommendation): string {
  if (recommendation.status === "clarification_required") return "Waiting for the shopper's answer; no order or offer was created.";
  if (recommendation.status === "professional_guidance") return "No routine, order or commercial action was created.";
  if (recommendation.status === "no_match") return "The safe result contains zero invented or unavailable products.";
  return `${recommendation.items.length} catalog-backed item${recommendation.items.length === 1 ? "" : "s"} selected; checkout still requires explicit confirmation.`;
}
