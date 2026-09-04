import Ajv2020 from "ajv/dist/2020.js";
import offerDecisionSchema from "../../../schemas/offer_decision_schema.json" with { type: "json" };
import type { CatalogSnapshot } from "@/domain/catalog/types";
import type { OfferCandidate, OfferDecision } from "@/domain/offers/select-offer";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import { hashCanonicalJson } from "@/server/security/canonical-json";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  formats: { "date-time": true },
});
const validateDecision = ajv.compile(offerDecisionSchema);

export function assertOfferDecisionSchema(
  snapshot: CatalogSnapshot,
  decision: OfferDecision,
  intent: NormalizedCustomerIntent,
  sessionId: string,
): void {
  const schemaDecision = toOfferDecisionSchema(snapshot, decision, intent, sessionId);
  if (validateDecision(schemaDecision)) return;
  const issues = validateDecision.errors
    ?.map(({ instancePath, keyword }) => `${instancePath || "/"}:${keyword}`)
    .join(",");
  throw new Error(`Offer decision failed its declared schema: ${issues || "unknown"}`);
}

export function toOfferDecisionSchema(
  snapshot: CatalogSnapshot,
  decision: OfferDecision,
  intent: NormalizedCustomerIntent,
  sessionId: string,
): Record<string, unknown> {
  const baseline = decision.candidates.find(
    (candidate) => candidate.candidateId === decision.baselineCandidateId,
  ) ?? decision.candidates[0];
  const selected = decision.candidates.find(
    (candidate) => candidate.candidateId === decision.selectedCandidateId,
  ) ?? baseline;
  const hasValidSelection = selected.status !== "rejected";
  const selectedReasonCode = hasValidSelection
    ? selected.candidateId === baseline.candidateId
      ? "BASELINE_SELECTED_NO_BETTER_OFFER"
      : "HIGHEST_VALID_PROFIT_SCORE"
    : "NO_VALID_OFFER";
  const candidates = decision.candidates.map((candidate) =>
    candidateToSchema(snapshot, candidate, baseline),
  );
  const engineReasonCodes = [
    selectedReasonCode,
    "CUSTOMER_CONFIRMATION_REQUIRED",
    ...decision.merchantExplanation.primaryRejectionReasonCodes,
  ];
  const decisionCore = {
    decisionId: decision.decisionId,
    baselineCandidateId: decision.baselineCandidateId,
    selectedCandidateId: hasValidSelection ? selected.candidateId : null,
    candidates,
  };

  return {
    schema_version: "1.0.0",
    decision_id: decision.decisionId,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    catalog_version: decision.catalogVersion,
    configuration_versions: {
      product_variants: resourceVersion(snapshot, "product_variants"),
      merchant_economics: resourceVersion(snapshot, "merchant_economics"),
      product_profiles: resourceVersion(snapshot, "product_profiles"),
      product_compatibility: resourceVersion(snapshot, "product_compatibility"),
      bundle_components: resourceVersion(snapshot, "bundle_components"),
      discount_policy: snapshot.discountPolicy.version,
      profit_formula: snapshot.profitPolicy.version,
      offer_ranking: snapshot.profitPolicy.version,
    },
    currency: "INR",
    amount_unit: "minor_units_paise",
    intent_snapshot_hash: hashCanonicalJson(intent),
    decision_status: hasValidSelection ? "selected" : "no_valid_offer",
    selection_method: decision.selectionMethod,
    randomness_used: decision.randomnessUsed,
    model_role: "intent_and_explanation_only",
    baseline_candidate_id: decision.baselineCandidateId,
    candidates,
    selected_candidate_id: hasValidSelection ? selected.candidateId : null,
    selection_summary: {
      evaluated_count: candidates.length,
      eligible_count: decision.candidates.filter((candidate) => candidate.status !== "rejected").length,
      rejected_count: decision.candidates.filter((candidate) => candidate.status === "rejected").length,
      selected_reason_code: selectedReasonCode,
      tie_breaker_used: null,
    },
    customer_explanation: {
      headline: decision.customerExplanation.headline,
      summary: decision.customerExplanation.summary,
      item_reasons: selected.profit.lines.map((line) => ({
        product_id: line.productId,
        reason: "Included by the catalog-backed candidate that passed the applicable policy checks.",
      })),
      offer_reason: decision.customerExplanation.offerReason,
      discount_message: decision.customerExplanation.discountMessage,
      safety_notes: decision.customerExplanation.safetyNotes,
      discloses_internal_costs: decision.customerExplanation.disclosesInternalCosts,
    },
    merchant_explanation: {
      selected_rationale: decision.merchantExplanation.selectedRationale,
      profit_formula_version: snapshot.profitPolicy.version,
      selected_contribution_profit_paise: decision.merchantExplanation.selectedContributionProfitPaise,
      incremental_contribution_profit_paise: decision.merchantExplanation.incrementalContributionProfitPaise,
      rejected_candidate_ids: decision.merchantExplanation.rejectedCandidateIds,
      primary_rejection_reason_codes: decision.merchantExplanation.primaryRejectionReasonCodes,
    },
    customer_gate: {
      confirmation_required: true,
      confirmation_status: hasValidSelection ? "awaiting_customer" : "not_requested",
      confirmed_at: null,
      confirmed_total_paise: null,
      confirmed_cart_hash: null,
      decision_revalidated_after_confirmation: false,
      order_creation_authorized: false,
    },
    audit: {
      trace_id: `TRACE-${decision.decisionId}`,
      input_hash: hashCanonicalJson({ sessionId, intent }),
      candidate_set_hash: hashCanonicalJson(candidates),
      decision_hash: hashCanonicalJson(decisionCore),
      engine_reason_codes: [...new Set(engineReasonCodes)],
      contains_raw_payment_credentials: false,
      contains_sensitive_pricing_signal: false,
    },
  };
}

function candidateToSchema(
  snapshot: CatalogSnapshot,
  candidate: OfferCandidate,
  baseline: OfferCandidate,
): Record<string, unknown> {
  const threshold = candidate.candidateType === "threshold_incentive";
  const dynamicDiscount = candidate.candidateType === "discounted_product";
  return {
    candidate_id: candidate.candidateId,
    candidate_type: candidate.candidateType,
    candidate_status: candidate.status,
    lines: candidate.profit.lines.map((line) => ({
      product_id: line.productId,
      variant_id: line.variantId,
      quantity: line.quantity,
      routine_role: routineRole(snapshot, line.productId),
      unit_price_paise: line.unitPricePaise,
      line_subtotal_paise: line.lineSubtotalPaise,
      line_discount_paise: line.lineDiscountPaise,
      line_final_paise: line.lineFinalPaise,
      discount_eligible: (snapshot.economics.get(line.variantId)?.maxDiscountBps ?? 0) > 0,
    })),
    customer_total_paise: candidate.profit.netRevenuePaise,
    discount: {
      applied: candidate.customerSavingPaise > 0,
      trigger_id: dynamicDiscount ? candidate.discountTriggerId : null,
      discount_rate_bps: dynamicDiscount ? candidate.discountRateBps : 0,
      discount_amount_paise: candidate.customerSavingPaise,
      threshold_offer_id: threshold ? candidate.discountTriggerId : null,
      policy_reason_code: threshold
        ? "THRESHOLD_INCENTIVE_APPLIED"
        : dynamicDiscount
          ? "DISCOUNT_TRIGGER_APPLIED"
          : "NO_DISCOUNT",
    },
    profit: {
      gross_item_revenue_paise: candidate.profit.grossItemRevenuePaise,
      discount_cost_paise: candidate.profit.discountCostPaise,
      net_revenue_paise: candidate.profit.netRevenuePaise,
      product_cost_paise: candidate.profit.productCostPaise,
      packaging_cost_paise: candidate.profit.packagingCostPaise,
      fulfilment_cost_paise: candidate.profit.fulfilmentCostPaise,
      expected_return_cost_paise: candidate.profit.expectedReturnCostPaise,
      estimated_payment_cost_paise: candidate.profit.estimatedPaymentCostPaise,
      incentive_cost_paise: candidate.profit.incentiveCostPaise,
      contribution_profit_paise: candidate.profit.contributionProfitPaise,
      contribution_margin_bps: candidate.profit.contributionMarginBps,
    },
    ranking: {
      relevance_weight_bps: candidate.ranking.relevanceWeightBps,
      compatibility_weight_bps: candidate.ranking.compatibilityWeightBps,
      budget_fit_weight_bps: candidate.ranking.budgetFitWeightBps,
      intent_weight_bps: candidate.ranking.intentWeightBps,
      friction_penalty_units: candidate.ranking.frictionPenaltyUnits,
      risk_penalty_units: candidate.ranking.riskPenaltyUnits,
      final_offer_score_units: candidate.ranking.finalOfferScoreUnits,
      score_is_probability: false,
    },
    compatibility: {
      decision: candidate.compatibility.decision,
      matched_rule_ids: candidate.compatibility.matchedRuleIds,
      reason_codes:
        candidate.compatibility.decision === "allow"
          ? []
          : [`COMPATIBILITY_${candidate.compatibility.decision.toUpperCase()}`],
    },
    hard_guard_results: candidate.guardResults.map((result) => ({
      rule_id: result.ruleId,
      passed: result.passed,
      reason_code: result.reasonCode,
      detail: result.detail,
    })),
    rejection_reason_codes: [...new Set(candidate.rejectionReasonCodes)],
    baseline_comparison: {
      baseline_candidate_id: baseline.candidateId,
      incremental_net_revenue_paise: candidate.profit.netRevenuePaise - baseline.profit.netRevenuePaise,
      incremental_contribution_profit_paise: candidate.incrementalContributionProfitPaise,
      offer_score_delta_units: candidate.offerScoreDeltaUnits,
    },
  };
}

function resourceVersion(snapshot: CatalogSnapshot, resourceId: string): string {
  return snapshot.integrity.resourceVersions[resourceId] ?? snapshot.version;
}

function routineRole(snapshot: CatalogSnapshot, productId: string): string {
  const step = snapshot.profiles.get(productId)?.routineStep ?? "treat";
  if (step === "multi_step_bundle") return step;
  if (step.startsWith("tone")) return "tone";
  if (step.includes("exfoliate")) return "exfoliate";
  if (step.includes("hydrate")) return "hydrate";
  if (step.includes("moisturize")) return "moisturize";
  if (step.includes("protect")) return "protect";
  if (step.includes("cleanse")) return "cleanse";
  if (step.includes("mask")) return "mask";
  if (step.includes("eye")) return "eye_care";
  if (step.includes("lip")) return "lip_care";
  return "treat";
}
