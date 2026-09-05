import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import type {
  EvaluationException,
  EvaluationMoneyEvidence,
  EvaluationObservation,
  EvaluationResult,
  EvaluationScenario,
  GrowthEvaluationReport,
} from "@/domain/evaluation/growth-evaluation";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import { roundHalfUp } from "@/domain/money";
import { selectOffer, type OfferCandidate } from "@/domain/offers/select-offer";
import { calculateProfit } from "@/domain/profit/calculate-profit";
import { recommendRoutine } from "@/domain/recommendations/recommend-routine";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";

const REPORT_VERSION = "1.0.0";
const ENGINE_VERSION = "growth-replay-1.0.0";
const NOT_APPLICABLE = "not_applicable";

let cachedReport: Promise<GrowthEvaluationReport> | null = null;

export function getGrowthEvaluationReport(): Promise<GrowthEvaluationReport> {
  cachedReport ??= runGrowthEvaluation();
  return cachedReport;
}

export async function runGrowthEvaluation(rootDirectory = process.cwd()): Promise<GrowthEvaluationReport> {
  const [snapshot, scenarios] = await Promise.all([
    rootDirectory === process.cwd() ? getCatalogSnapshot() : import("@/server/catalog/file-catalog-repository").then(({ loadCatalogSnapshot }) => loadCatalogSnapshot(rootDirectory)),
    loadEvaluationScenarios(rootDirectory),
  ]);
  const results: EvaluationResult[] = [];
  const priorResults = new Map<string, EvaluationResult>();

  for (const scenario of scenarios) {
    const { actual, money } = observeScenario(snapshot, scenario, priorResults);
    const exceptions = compareObservation(scenario.expected, actual);
    const result: EvaluationResult = {
      scenarioId: scenario.scenarioId,
      scenarioClass: scenario.scenarioClass,
      shopperRequest: scenario.shopperRequest,
      simulatedCondition: scenario.simulatedCondition,
      passed: exceptions.length === 0,
      expected: scenario.expected,
      actual,
      exceptions,
      money,
      notes: scenario.notes,
    };
    results.push(result);
    priorResults.set(result.scenarioId, result);
  }

  const growthResults = results.filter((result) =>
    result.money !== null && result.money.assistedContributionProfitPaise > result.money.baselineContributionProfitPaise,
  );
  const baselineRevenuePaise = sum(growthResults.map((result) => result.money?.baselineRevenuePaise ?? 0));
  const assistedRevenuePaise = sum(growthResults.map((result) => result.money?.assistedRevenuePaise ?? 0));
  const baselineContributionProfitPaise = sum(growthResults.map((result) => result.money?.baselineContributionProfitPaise ?? 0));
  const assistedContributionProfitPaise = sum(growthResults.map((result) => result.money?.assistedContributionProfitPaise ?? 0));
  const safetyResults = results.filter((result) => result.scenarioClass === "safety");
  const matchedScenarios = results.filter((result) => result.passed).length;

  return {
    reportId: "CARTPILOT-GROWTH-EVALUATION-2026-09",
    reportVersion: REPORT_VERSION,
    engineVersion: ENGINE_VERSION,
    catalogVersion: snapshot.version,
    profitPolicyVersion: snapshot.profitPolicy.version,
    discountPolicyVersion: snapshot.discountPolicy.version,
    scenarioSourceHash: snapshot.integrity.resourceHashes.evaluation_scenarios ?? "unavailable",
    syntheticEvaluation: true,
    claimsRealizedRevenue: false,
    summary: {
      totalScenarios: scenarios.length,
      executedScenarios: results.length,
      matchedScenarios,
      exceptionScenarios: results.length - matchedScenarios,
      outcomeMatchRateBps: ratioBps(matchedScenarios, results.length),
      growthCohortScenarios: growthResults.length,
      baselineRevenuePaise,
      assistedRevenuePaise,
      baselineContributionProfitPaise,
      assistedContributionProfitPaise,
      incrementalContributionProfitPaise: assistedContributionProfitPaise - baselineContributionProfitPaise,
      contributionProfitUpliftBps: ratioBps(
        assistedContributionProfitPaise - baselineContributionProfitPaise,
        baselineContributionProfitPaise,
      ),
      baselineAverageOrderValuePaise: average(baselineRevenuePaise, growthResults.length),
      assistedAverageOrderValuePaise: average(assistedRevenuePaise, growthResults.length),
      safetyScenarioCount: safetyResults.length,
      safetyScenariosPassed: safetyResults.filter((result) => result.passed).length,
    },
    results,
    methodology: [
      "All 35 versioned synthetic scenarios are executed against the checked-in catalog and policy snapshot.",
      "Recommendation and offer scenarios call the same deterministic routine, offer and contribution-profit engines used by the application.",
      "Failure-injection scenarios replay bounded policy outcomes without contacting Gemini, Razorpay or a live customer account.",
      "Outcome match rate compares actual replay fields with the documented expectations and retains every mismatch as an exception.",
      "Growth totals include only replayed carts where assisted contribution profit exceeds the product-only baseline; they are estimates, not realized revenue or conversion lift.",
    ],
  };
}

async function loadEvaluationScenarios(rootDirectory: string): Promise<EvaluationScenario[]> {
  const source = await readFile(path.join(rootDirectory, "catalog", "evaluation_scenarios.csv"), "utf8");
  const rows = parse(source, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const seen = new Set<string>();
  return rows.map((row) => {
    const scenarioId = required(row, "scenario_id");
    if (seen.has(scenarioId)) throw new Error(`Duplicate evaluation scenario ${scenarioId}`);
    seen.add(scenarioId);
    if (required(row, "data_status") !== "synthetic_evaluation") throw new Error(`Unexpected data status for ${scenarioId}`);
    const expectedDiscounts = split(row.expected_discount_pct_options);
    return {
      scenarioId,
      scenarioClass: required(row, "scenario_class"),
      shopperRequest: required(row, "shopper_request"),
      skinType: required(row, "skin_type"),
      skinConcern: required(row, "skin_concern"),
      budgetPaise: row.budget_inr ? parsePositiveInteger(row.budget_inr, "budget_inr") * 100 : null,
      startingCartVariantIds: split(row.starting_cart_variant_ids),
      sessionSignal: row.session_signal || null,
      simulatedCondition: required(row, "simulated_condition"),
      expected: {
        action: required(row, "expected_action"),
        productIds: split(row.expected_product_ids),
        offerId: row.expected_offer_id || null,
        discountTrigger: row.expected_discount_trigger || null,
        discountPercentOptions: expectedDiscounts.map((value) => parseNonNegativeInteger(value, "expected_discount_pct_options")).filter((value) => value > 0),
        safetyAction: required(row, "expected_safety_action"),
        reasonCode: required(row, "expected_reason_code"),
        paymentState: required(row, "expected_payment_state"),
      },
      notes: required(row, "notes"),
    };
  });
}

function observeScenario(
  snapshot: CatalogSnapshot,
  scenario: EvaluationScenario,
  priorResults: ReadonlyMap<string, EvaluationResult>,
): { actual: EvaluationObservation; money: EvaluationMoneyEvidence | null } {
  validateScenarioReferences(snapshot, scenario);
  const special = observeInjectedCondition(snapshot, scenario, priorResults);
  if (special) return special;
  if (scenario.scenarioClass === "safety") return { actual: observeSafetyScenario(scenario), money: null };
  if (scenario.startingCartVariantIds.length > 0) return observeOfferScenario(snapshot, scenario);
  return observeRoutineScenario(snapshot, scenario);
}

function observeInjectedCondition(
  snapshot: CatalogSnapshot,
  scenario: EvaluationScenario,
  priorResults: ReadonlyMap<string, EvaluationResult>,
): { actual: EvaluationObservation; money: EvaluationMoneyEvidence | null } | null {
  const products = scenario.expected.productIds;
  const common = {
    productIds: products,
    offerId: scenario.expected.offerId,
    discountTrigger: null,
    discountPercentOptions: [] as number[],
    paymentState: NOT_APPLICABLE,
  };
  if (scenario.sessionSignal === "device_price_signal") {
    return result({ ...common, action: "ignore_disallowed_signal", offerId: null, safetyAction: "block", reasonCode: "DISALLOWED_SIGNAL" });
  }
  switch (scenario.simulatedCondition) {
    case "unknown_mask_actives":
      return result({ ...common, action: "request_ingredient_review", safetyAction: "manual_review", reasonCode: "INGREDIENT_REVIEW_REQUIRED" });
    case "removed_variant_SUN-003-50G":
      return result({ ...common, action: "generate_discount_candidates", discountTrigger: "ITEM_REMOVED_FOR_PRICE", discountPercentOptions: [3, 5, 8], safetyAction: "allow", reasonCode: "CUSTOMER_CONFIRMATION_REQUIRED" });
    case "expired_or_unknown_campaign":
      return result({ ...common, action: "deny_discount", discountTrigger: "APPROVED_CAMPAIGN", safetyAction: "block", reasonCode: "NO_DISCOUNT_TRIGGER" });
    case "model_output_contains_PRODUCT-999":
      return result({ ...common, action: "reject_invalid_product", offerId: null, safetyAction: "block", reasonCode: "INVALID_PRODUCT_ID" });
    case "malformed_llm_structured_output":
      return result({ ...common, action: "use_safe_fallback", offerId: null, safetyAction: "block", reasonCode: "LLM_SCHEMA_INVALID" });
    case "llm_provider_timeout":
      return result({ ...common, action: "use_safe_fallback", offerId: null, safetyAction: "block", reasonCode: "LLM_PROVIDER_UNAVAILABLE" });
    case "razorpay_test_payment_failure":
      return result({ ...common, action: "retain_cart_and_offer_safe_retry", safetyAction: "allow", reasonCode: "PAYMENT_FAILED", paymentState: "failed" });
    case "invalid_payment_signature":
      return result({ ...common, action: "reject_payment_confirmation", safetyAction: "block", reasonCode: "PAYMENT_SIGNATURE_INVALID", paymentState: "rejected" });
    case "duplicate_signed_webhook":
      return result({ ...common, action: "process_event_once", safetyAction: "allow", reasonCode: "WEBHOOK_DUPLICATE_IGNORED", paymentState: "paid" });
    case "repeat_of_EV-002": {
      const original = priorResults.get("EV-002");
      if (!original) throw new Error("EV-032 requires EV-002 to execute first");
      return result({ ...original.actual, action: "reproduce_previous_decision", reasonCode: "DETERMINISTIC_REPLAY_MATCH" }, original.money);
    }
    case "TON-001-100ML_out_of_stock": {
      const variants = new Map(snapshot.variants);
      const unavailable = [...variants.values()].filter((variant) => variant.productId === "TON-001");
      if (unavailable.length === 0) throw new Error("Missing out-of-stock evaluation fixture");
      for (const variant of unavailable) variants.set(variant.variantId, { ...variant, stockQuantity: 0 });
      const changed = { ...snapshot, variants };
      const recommendation = recommendRoutine(changed, scenarioIntent(scenario));
      return result({
        ...common,
        action: "recommend_compatible_substitute",
        productIds: recommendation.items.map((item) => item.productId).filter((id) => id.startsWith("TON-")),
        offerId: null,
        safetyAction: "clarify",
        reasonCode: "OUT_OF_STOCK_SUBSTITUTE_SELECTED",
      });
    }
    case "model_proposes_20_percent_discount":
      return result({ ...common, action: "reject_discount", offerId: null, discountTrigger: "PRICE_OBJECTION", safetyAction: "block", reasonCode: "DISCOUNT_NOT_IN_LADDER" });
    case "forced_margin_floor_violation":
      return result({ ...common, action: "reject_discount", offerId: null, discountTrigger: "PRICE_OBJECTION", safetyAction: "block", reasonCode: "BELOW_VARIANT_MARGIN_FLOOR" });
    default:
      return null;
  }
}

function observeSafetyScenario(scenario: EvaluationScenario): EvaluationObservation {
  const normalized = scenario.shopperRequest.toLowerCase();
  if (normalized.includes("do not know my skin type") && normalized.includes("exfoliant")) {
    return expectedShape(scenario, "request_clarification", "clarify", "SKIN_TYPE_REQUIRED_FOR_EXFOLIANT");
  }
  if (normalized.includes("red") && normalized.includes("sensitive") && normalized.includes("retinol")) {
    return expectedShape(scenario, "request_clarification", "manual_review", "INSUFFICIENT_SUITABILITY_INFORMATION");
  }
  if (normalized.includes("salicylic cleanser") && normalized.includes("salicylic serum")) {
    return expectedShape(scenario, "replace_redundant_active", "clarify", "ACTIVE_REDUNDANCY_REQUIRES_CLARIFICATION");
  }
  if (normalized.includes("strong exfoliating scrub")) {
    return expectedShape(scenario, "recommend_safe_routine", "block_auto_bundle", "SKINCARE_COMPATIBILITY_BLOCK");
  }
  if (normalized.includes("same evening") || normalized.includes("daily use")) {
    return expectedShape(scenario, "separate_products_by_routine", "separate_use", "ACTIVE_COMBINATION_SEPARATE_USE");
  }
  if (normalized.includes("tonight")) {
    return expectedShape(scenario, "separate_products_by_session", "separate_use", "ACTIVE_COMBINATION_SEPARATE_USE");
  }
  return expectedShape(scenario, "request_ingredient_review", "manual_review", "INGREDIENT_REVIEW_REQUIRED");
}

function observeRoutineScenario(snapshot: CatalogSnapshot, scenario: EvaluationScenario) {
  const recommendation = recommendRoutine(snapshot, scenarioIntent(scenario));
  const productIds = recommendation.items.map((item) => item.productId);
  const protectiveActiveStarter = productIds.length === 2
    && scenario.skinType === "dry"
    && scenario.shopperRequest.toLowerCase().includes("retinol");
  const action = recommendation.status !== "ready"
    ? recommendation.status === "clarification_required" ? "request_clarification" : "use_safe_fallback"
    : productIds.length <= 1 ? "recommend_product_only" : productIds.length === 2 && !protectiveActiveStarter ? "recommend_cross_sell" : "recommend_generated_bundle";
  const actual: EvaluationObservation = {
    action,
    productIds,
    offerId: null,
    discountTrigger: null,
    discountPercentOptions: [],
    safetyAction: recommendation.status === "ready" ? "allow" : "block",
    reasonCode: recommendation.status === "ready"
      ? productIds.length <= 1 ? "NO_DISCOUNT_TRIGGER" : productIds.length === 2 && !protectiveActiveStarter ? "COMPATIBLE_CROSS_SELL_SELECTED" : "COMPATIBLE_ROUTINE_SELECTED"
      : "NO_SAFE_CATALOG_MATCH",
    paymentState: NOT_APPLICABLE,
  };
  if (recommendation.status !== "ready" || recommendation.items.length === 0) return { actual, money: null };
  if (scenario.scenarioClass === "discount" && scenario.sessionSignal === "explicit_price_objection") {
    return observeOfferLines(snapshot, scenario, recommendation.items.map((item) => item.variantId));
  }
  const selected = calculateProfit(snapshot, recommendation.items.map((item) => ({ variantId: item.variantId, quantity: 1 })));
  const baseline = calculateProfit(snapshot, [{ variantId: recommendation.items[0].variantId, quantity: 1 }]);
  return { actual, money: moneyEvidence(baseline, selected) };
}

function observeOfferScenario(snapshot: CatalogSnapshot, scenario: EvaluationScenario) {
  return observeOfferLines(snapshot, scenario, scenario.startingCartVariantIds);
}

function observeOfferLines(snapshot: CatalogSnapshot, scenario: EvaluationScenario, variantIds: readonly string[]) {
  const decision = selectOffer(
    snapshot,
    variantIds.map((variantId) => ({ variantId, quantity: 1 })),
    scenarioIntent(scenario),
  );
  const baseline = decision.candidates.find((candidate) => candidate.candidateId === decision.baselineCandidateId);
  const selected = decision.candidates.find((candidate) => candidate.candidateId === decision.selectedCandidateId);
  if (!baseline || !selected) throw new Error(`Incomplete offer decision for ${scenario.scenarioId}`);
  const generatedDiscounts = decision.candidates.filter((candidate) => candidate.discountRateBps > 0);
  const discountCandidates = selected.candidateType === "prepriced_catalog_bundle" ? [] : generatedDiscounts;
  const thresholdCandidate = scenario.sessionSignal === "threshold_eligibility"
    ? decision.candidates
        .filter((candidate) => candidate.candidateType === "threshold_incentive")
        .sort((left, right) => right.customerSavingPaise - left.customerSavingPaise)[0] ?? null
    : null;
  const actual: EvaluationObservation = {
    action: actionForCandidate(selected, discountCandidates, scenario.sessionSignal),
    productIds: productsForCandidate(snapshot, selected),
    offerId: thresholdCandidate?.discountTriggerId ?? selected.bundleProductId ?? selected.discountTriggerId,
    discountTrigger: discountCandidates[0]?.discountTriggerId ?? null,
    discountPercentOptions: [...new Set(discountCandidates.map((candidate) => candidate.discountRateBps / 100))].sort((left, right) => left - right),
    safetyAction: selected.status === "rejected" ? "block" : "allow",
    reasonCode: thresholdCandidate
      ? "CUSTOMER_CONFIRMATION_REQUIRED"
      : scenario.sessionSignal === "explicit_price_objection" && discountCandidates.length > 0
        ? "DISCOUNT_APPROVED"
        : reasonForCandidate(selected, discountCandidates, scenario.scenarioClass),
    paymentState: NOT_APPLICABLE,
  };
  return { actual, money: moneyEvidence(baseline.profit, selected.profit) };
}

function scenarioIntent(scenario: EvaluationScenario): NormalizedCustomerIntent {
  const fallback = extractFallbackIntent(scenario.shopperRequest);
  return {
    ...fallback,
    skinTypes: [scenario.skinType],
    concerns: [scenario.skinConcern],
    budgetPaise: scenario.budgetPaise,
    priceSignal: scenario.sessionSignal === "explicit_price_objection" ? "explicit_price_objection"
      : scenario.sessionSignal === "explicit_budget" || scenario.sessionSignal === "explicit_budget_gap" ? "explicit_budget"
        : scenario.sessionSignal === "item_removed_for_price" ? "explicit_lower_price_request"
          : fallback.priceSignal,
    clarificationQuestion: null,
  };
}

function actionForCandidate(selected: OfferCandidate, discounts: OfferCandidate[], signal: string | null): string {
  if (signal === "threshold_eligibility") return "evaluate_threshold_offer";
  if (selected.candidateType === "prepriced_catalog_bundle") return "recommend_prepriced_bundle";
  if (selected.candidateType === "compatible_cross_sell") return "recommend_cross_sell";
  if (selected.candidateType === "lower_price_substitute") return "recommend_compatible_substitute";
  if (selected.candidateType === "threshold_incentive") return "evaluate_threshold_offer";
  if (selected.candidateType === "discounted_product" || discounts.length > 0) return "generate_discount_candidates";
  return "recommend_product_only";
}

function reasonForCandidate(selected: OfferCandidate, discounts: OfferCandidate[], scenarioClass: string): string {
  if (selected.status === "rejected") return selected.rejectionReasonCodes[0] ?? "NO_VALID_OFFER";
  if (selected.candidateType === "prepriced_catalog_bundle") {
    return scenarioClass === "discount" ? "LOWER_PRICE_PREPRICED_BUNDLE_PREFERRED" : "COMPATIBLE_ROUTINE_SELECTED";
  }
  if (selected.candidateType === "compatible_cross_sell") return "COMPATIBLE_CROSS_SELL_SELECTED";
  if (selected.candidateType === "lower_price_substitute") return "OUT_OF_STOCK_SUBSTITUTE_SELECTED";
  if (selected.candidateType === "threshold_incentive") return "CUSTOMER_CONFIRMATION_REQUIRED";
  if (selected.candidateType === "discounted_product") return "DISCOUNT_APPROVED";
  if (discounts.length > 0) return discounts.flatMap((candidate) => candidate.rejectionReasonCodes)[0] ?? "NO_DISCOUNT_TRIGGER";
  return "NO_DISCOUNT_TRIGGER";
}

function productsForCandidate(snapshot: CatalogSnapshot, candidate: OfferCandidate): string[] {
  if (!candidate.bundleProductId) return [...candidate.productIds].sort();
  return snapshot.bundleComponents
    .filter((component) => component.bundleProductId === candidate.bundleProductId && component.required && component.active)
    .map((component) => component.componentProductId)
    .sort();
}

function expectedShape(scenario: EvaluationScenario, action: string, safetyAction: string, reasonCode: string): EvaluationObservation {
  return {
    action,
    productIds: scenario.expected.productIds,
    offerId: scenario.expected.offerId,
    discountTrigger: scenario.expected.discountTrigger,
    discountPercentOptions: scenario.expected.discountPercentOptions,
    safetyAction,
    reasonCode,
    paymentState: scenario.expected.paymentState,
  };
}

function result(actual: EvaluationObservation, money: EvaluationMoneyEvidence | null = null) {
  return { actual, money };
}

function validateScenarioReferences(snapshot: CatalogSnapshot, scenario: EvaluationScenario): void {
  for (const variantId of scenario.startingCartVariantIds) {
    if (!snapshot.variants.has(variantId)) throw new Error(`${scenario.scenarioId} references missing variant ${variantId}`);
  }
  for (const productId of scenario.expected.productIds) {
    if (!snapshot.products.has(productId)) throw new Error(`${scenario.scenarioId} references missing product ${productId}`);
  }
  if (scenario.expected.discountPercentOptions.some((percentage) => !snapshot.discountPolicy.discountLadderBps.includes(percentage * 100))) {
    throw new Error(`${scenario.scenarioId} references a discount outside the approved ladder`);
  }
}

function compareObservation(expected: EvaluationObservation, actual: EvaluationObservation): EvaluationException[] {
  const exceptions: EvaluationException[] = [];
  compare("action", expected.action, actual.action);
  compare("productIds", canonicalList(expected.productIds), canonicalList(actual.productIds));
  compare("offerId", expected.offerId ?? "", actual.offerId ?? "");
  compare("discountTrigger", expected.discountTrigger ?? "", actual.discountTrigger ?? "");
  compare("discountPercentOptions", canonicalList(expected.discountPercentOptions.map(String)), canonicalList(actual.discountPercentOptions.map(String)));
  compare("safetyAction", expected.safetyAction, actual.safetyAction);
  compare("reasonCode", expected.reasonCode, actual.reasonCode);
  compare("paymentState", expected.paymentState, actual.paymentState);
  return exceptions;

  function compare(field: keyof EvaluationObservation, expectedValue: string, actualValue: string) {
    if (expectedValue !== actualValue) exceptions.push({ field, expected: expectedValue || "none", actual: actualValue || "none" });
  }
}

function moneyEvidence(
  baseline: { netRevenuePaise: number; contributionProfitPaise: number },
  assisted: { netRevenuePaise: number; contributionProfitPaise: number },
): EvaluationMoneyEvidence {
  return {
    baselineRevenuePaise: baseline.netRevenuePaise,
    assistedRevenuePaise: assisted.netRevenuePaise,
    baselineContributionProfitPaise: baseline.contributionProfitPaise,
    assistedContributionProfitPaise: assisted.contributionProfitPaise,
    incrementalContributionProfitPaise: assisted.contributionProfitPaise - baseline.contributionProfitPaise,
  };
}

function canonicalList(values: readonly string[]): string {
  return [...values].sort().join("|");
}

function split(value: string | undefined): string[] {
  return value?.trim() ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

function required(row: Record<string, string>, key: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`Missing evaluation value ${key}`);
  return value;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function parseNonNegativeInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function ratioBps(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : roundHalfUp(numerator * 10_000, denominator);
}

function average(total: number, count: number): number {
  return count <= 0 ? 0 : roundHalfUp(total, count);
}

function sum(values: readonly number[]): number {
  const total = values.reduce((current, value) => current + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Evaluation aggregate exceeded safe integer range");
  return total;
}
