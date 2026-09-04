import type { CatalogSnapshot, ProductVariant } from "@/domain/catalog/types";
import { evaluateCompatibility, type CompatibilityEvaluation } from "@/domain/compatibility/evaluate-compatibility";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import { ceilRatio, formatInr, roundHalfUp } from "@/domain/money";
import { evaluateCustomerConstraints } from "@/domain/policies/customer-constraints";
import {
  calculateProfit,
  type PricedCandidateLine,
  type ProfitBreakdown,
} from "@/domain/profit/calculate-profit";

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export type OfferCandidateType =
  | "requested_product_only"
  | "compatible_cross_sell"
  | "prepriced_catalog_bundle"
  | "lower_price_substitute"
  | "threshold_incentive"
  | "discounted_product"
  | "no_additional_offer";

export interface GuardResult {
  ruleId: string;
  passed: boolean;
  reasonCode: string | null;
  detail: string;
}

export interface OfferRanking {
  relevanceWeightBps: number;
  compatibilityWeightBps: number;
  budgetFitWeightBps: number;
  intentWeightBps: number;
  frictionPenaltyUnits: number;
  riskPenaltyUnits: number;
  finalOfferScoreUnits: number;
  scoreIsProbability: false;
}

export interface OfferCandidate {
  candidateId: string;
  candidateType: OfferCandidateType;
  status: "baseline" | "eligible" | "rejected" | "selected";
  lines: PricedCandidateLine[];
  productIds: string[];
  addedProductIds: string[];
  bundleProductId: string | null;
  profit: ProfitBreakdown;
  ranking: OfferRanking;
  compatibility: CompatibilityEvaluation;
  guardResults: GuardResult[];
  rejectionReasonCodes: string[];
  discountRateBps: number;
  discountTriggerId: string | null;
  customerSavingPaise: number;
  incrementalContributionProfitPaise: number;
  offerScoreDeltaUnits: number;
  offerScoreImprovementBps: number;
}

export interface OfferDecision {
  decisionId: string;
  catalogVersion: string;
  policyVersion: string;
  selectionMethod: "deterministic_profit_policy";
  randomnessUsed: false;
  baselineCandidateId: string;
  selectedCandidateId: string;
  candidates: OfferCandidate[];
  customerExplanation: {
    headline: string;
    summary: string;
    offerReason: string;
    discountMessage: string | null;
    safetyNotes: string[];
    disclosesInternalCosts: false;
  };
  merchantExplanation: {
    selectedRationale: string;
    selectedContributionProfitPaise: number;
    incrementalContributionProfitPaise: number;
    rejectedCandidateIds: string[];
    primaryRejectionReasonCodes: string[];
  };
  customerConfirmationRequired: true;
  orderCreationAuthorized: false;
}

export function findConfirmableCandidate(
  decision: OfferDecision,
  candidateId: string,
): OfferCandidate | null {
  if (candidateId !== decision.baselineCandidateId && candidateId !== decision.selectedCandidateId) {
    return null;
  }
  const candidate = decision.candidates.find((item) => item.candidateId === candidateId) ?? null;
  return candidate?.status === "rejected" ? null : candidate;
}

interface CandidateDraft {
  candidateId: string;
  candidateType: OfferCandidateType;
  lines: PricedCandidateLine[];
  addedProductIds: string[];
  bundleProductId: string | null;
  discountRateBps: number;
  discountTriggerId: string | null;
  incentiveCostPaise?: number;
  bundleComponents?: Array<{ productId: string; variantId: string; quantity: number; active: boolean }>;
}

export function selectOffer(
  snapshot: CatalogSnapshot,
  cartLines: readonly CartLineInput[],
  intent: NormalizedCustomerIntent,
): OfferDecision {
  validateCart(cartLines);
  const baselineDraft = baselineCandidate(cartLines);
  const customerWantsLowerTotal = intent.priceSignal !== "none";
  const drafts = [
    baselineDraft,
    ...(customerWantsLowerTotal ? [] : generateBundleCandidates(snapshot, cartLines)),
    ...(customerWantsLowerTotal ? [] : generateCrossSellCandidates(snapshot, cartLines)),
    ...generateSubstituteCandidates(snapshot, cartLines, intent),
    ...generateDiscountCandidates(snapshot, baselineDraft, intent),
    ...generateThresholdCandidates(snapshot, baselineDraft),
  ];
  const uniqueDrafts = deduplicateDrafts(drafts);
  const initialCandidates = uniqueDrafts.map((draft) => evaluateCandidate(snapshot, draft, intent));
  const baseline = initialCandidates[0];
  const compared = initialCandidates.map((candidate) => compareWithBaseline(snapshot, candidate, baseline));
  const selected = chooseCandidate(compared);

  const candidates = compared.map((candidate) => ({
    ...candidate,
    status:
      candidate.status === "rejected"
        ? "rejected" as const
        : candidate.candidateId === selected.candidateId
          ? "selected" as const
          : candidate.candidateId === baseline.candidateId
            ? "baseline" as const
            : "eligible" as const,
  }));
  const finalSelected = candidates.find((candidate) => candidate.candidateId === selected.candidateId) ?? candidates[0];

  return {
    decisionId: createDecisionId(cartLines, intent),
    catalogVersion: snapshot.version,
    policyVersion: snapshot.profitPolicy.version,
    selectionMethod: "deterministic_profit_policy",
    randomnessUsed: false,
    baselineCandidateId: baseline.candidateId,
    selectedCandidateId: finalSelected.candidateId,
    candidates,
    customerExplanation: explainForCustomer(snapshot, finalSelected, baseline),
    merchantExplanation: explainForMerchant(finalSelected, candidates),
    customerConfirmationRequired: true,
    orderCreationAuthorized: false,
  };
}

function baselineCandidate(cartLines: readonly CartLineInput[]): CandidateDraft {
  return {
    candidateId: `OFR-BASE-${cartLines.map((line) => line.variantId).sort().join("-")}`.slice(0, 80),
    candidateType: "requested_product_only",
    lines: cartLines.map((line) => ({ ...line })),
    addedProductIds: [],
    bundleProductId: null,
    discountRateBps: 0,
    discountTriggerId: null,
  };
}

function generateBundleCandidates(snapshot: CatalogSnapshot, cartLines: readonly CartLineInput[]): CandidateDraft[] {
  const cartVariants = new Set(cartLines.map((line) => line.variantId));
  const groups = Map.groupBy(
    snapshot.bundleComponents.filter((component) => component.required),
    (component) => component.bundleVariantId,
  );
  const drafts: CandidateDraft[] = [];

  for (const [bundleVariantId, components] of groups) {
    if (!components || components.length === 0) continue;
    const componentVariants = new Set(components.map((component) => component.componentVariantId));
    const cartIsSubset = [...cartVariants].every((variantId) => componentVariants.has(variantId));
    if (!cartIsSubset || componentVariants.size <= cartVariants.size) continue;
    const bundleVariant = snapshot.variants.get(bundleVariantId);
    if (!bundleVariant) continue;

    drafts.push({
      candidateId: `OFR-BUNDLE-${bundleVariantId}`,
      candidateType: "prepriced_catalog_bundle",
      lines: [{ variantId: bundleVariantId, quantity: 1 }],
      addedProductIds: components
        .filter((component) => !cartVariants.has(component.componentVariantId))
        .map((component) => component.componentProductId),
      bundleProductId: bundleVariant.productId,
      discountRateBps: 0,
      discountTriggerId: null,
      bundleComponents: components.map((component) => ({
        productId: component.componentProductId,
        variantId: component.componentVariantId,
        quantity: component.quantity,
        active: component.active,
      })),
    });
  }
  return drafts;
}

function generateCrossSellCandidates(snapshot: CatalogSnapshot, cartLines: readonly CartLineInput[]): CandidateDraft[] {
  const cartProductIds = new Set(cartLines.map((line) => variantOrThrow(snapshot, line.variantId).productId));
  const drafts: CandidateDraft[] = [];

  for (const rule of snapshot.compatibilityRules) {
    if (rule.relationshipType !== "complements" || rule.safetyAction !== "allow") continue;
    let targetProductId: string | null = null;
    if (cartProductIds.has(rule.sourceProductId) && !cartProductIds.has(rule.targetProductId)) {
      targetProductId = rule.targetProductId;
    } else if (
      rule.directionality === "bidirectional" &&
      cartProductIds.has(rule.targetProductId) &&
      !cartProductIds.has(rule.sourceProductId)
    ) {
      targetProductId = rule.sourceProductId;
    }
    if (!targetProductId) continue;
    const variant = defaultVariant(snapshot, targetProductId);
    if (!variant) continue;
    drafts.push({
      candidateId: `OFR-XSELL-${variant.variantId}`,
      candidateType: "compatible_cross_sell",
      lines: [...cartLines.map((line) => ({ ...line })), { variantId: variant.variantId, quantity: 1 }],
      addedProductIds: [targetProductId],
      bundleProductId: null,
      discountRateBps: 0,
      discountTriggerId: null,
    });
  }
  return drafts;
}

function generateSubstituteCandidates(
  snapshot: CatalogSnapshot,
  cartLines: readonly CartLineInput[],
  intent: NormalizedCustomerIntent,
): CandidateDraft[] {
  if (!["explicit_lower_price_request", "explicit_budget"].includes(intent.priceSignal)) return [];
  const drafts: CandidateDraft[] = [];
  for (const [index, cartLine] of cartLines.entries()) {
    const current = variantOrThrow(snapshot, cartLine.variantId);
    for (const rule of snapshot.compatibilityRules) {
      if (rule.relationshipType !== "substitute_for") continue;
      const targetProductId =
        rule.sourceProductId === current.productId
          ? rule.targetProductId
          : rule.targetProductId === current.productId
            ? rule.sourceProductId
            : null;
      if (!targetProductId) continue;
      const target = defaultVariant(snapshot, targetProductId);
      if (!target || target.pricePaise >= current.pricePaise) continue;
      const lines = cartLines.map((line, lineIndex) =>
        lineIndex === index ? { variantId: target.variantId, quantity: cartLine.quantity } : { ...line },
      );
      drafts.push({
        candidateId: `OFR-SUB-${current.variantId}-${target.variantId}`.slice(0, 80),
        candidateType: "lower_price_substitute",
        lines,
        addedProductIds: [targetProductId],
        bundleProductId: null,
        discountRateBps: 0,
        discountTriggerId: null,
      });
    }
  }
  return drafts;
}

function generateDiscountCandidates(
  snapshot: CatalogSnapshot,
  baseline: CandidateDraft,
  intent: NormalizedCustomerIntent,
): CandidateDraft[] {
  const triggerId = intent.priceSignal === "explicit_budget" ? "BUDGET_GAP" : "PRICE_OBJECTION";
  if (!["explicit_budget", "explicit_price_objection", "explicit_discount_request"].includes(intent.priceSignal)) return [];
  if (
    !snapshot.discountPolicy.allowAdditionalDiscountOnPrepricedBundles &&
    containsPrepricedBundle(snapshot, baseline.lines)
  ) return [];
  const trigger = snapshot.discountPolicy.triggers.find((item) => item.triggerId === triggerId && item.enabled);
  if (!trigger) return [];

  const gross = sum(baseline.lines.map((line) => variantOrThrow(snapshot, line.variantId).pricePaise * line.quantity));
  if (triggerId === "BUDGET_GAP") {
    if (intent.budgetPaise === null || gross <= intent.budgetPaise) return [];
    const gap = gross - intent.budgetPaise;
    if (trigger.maximumGapPaise !== null && gap > trigger.maximumGapPaise) return [];
    if (
      trigger.maximumGapBpsOfBudget !== null &&
      roundHalfUp(gap * 10_000, intent.budgetPaise) > trigger.maximumGapBpsOfBudget
    ) return [];
  }

  const maxVariantDiscountBps = Math.min(
    ...baseline.lines.map((line) => snapshot.economics.get(line.variantId)?.maxDiscountBps ?? 0),
  );
  const allowedRates = trigger.allowedDiscountBps
    .filter((rate) => snapshot.discountPolicy.discountLadderBps.includes(rate))
    .filter((rate) => rate <= maxVariantDiscountBps)
    .sort((left, right) => left - right);
  const selectedRate =
    triggerId === "BUDGET_GAP"
      ? allowedRates.find((rate) => gross - roundHalfUp(gross * rate, 10_000) <= (intent.budgetPaise ?? 0))
      : allowedRates[0];
  if (!selectedRate) return [];

  const discountTotal = roundHalfUp(gross * selectedRate, 10_000);
  const allocations = allocateDiscount(discountTotal, baseline.lines.map((line) => variantOrThrow(snapshot, line.variantId).pricePaise * line.quantity));
  return [{
    candidateId: `OFR-DISCOUNT-${triggerId}-${selectedRate}`,
    candidateType: "discounted_product",
    lines: baseline.lines.map((line, index) => ({ ...line, lineDiscountPaise: allocations[index] })),
    addedProductIds: [],
    bundleProductId: null,
    discountRateBps: selectedRate,
    discountTriggerId: triggerId,
  }];
}

function generateThresholdCandidates(snapshot: CatalogSnapshot, baseline: CandidateDraft): CandidateDraft[] {
  if (
    !snapshot.discountPolicy.allowAdditionalDiscountOnPrepricedBundles &&
    containsPrepricedBundle(snapshot, baseline.lines)
  ) return [];
  const gross = sum(baseline.lines.map((line) => variantOrThrow(snapshot, line.variantId).pricePaise * line.quantity));
  return snapshot.discountPolicy.thresholdIncentives
    .filter((incentive) => incentive.enabled && gross >= incentive.minimumEligibleSubtotalPaise)
    .map((incentive) => {
      const allocations = allocateDiscount(
        incentive.discountPaise,
        baseline.lines.map((line) => variantOrThrow(snapshot, line.variantId).pricePaise * line.quantity),
      );
      return {
        candidateId: `OFR-THRESHOLD-${sanitizeIdentifier(incentive.offerId)}`,
        candidateType: "threshold_incentive" as const,
        lines: baseline.lines.map((line, index) => ({ ...line, lineDiscountPaise: allocations[index] })),
        addedProductIds: [],
        bundleProductId: null,
        discountRateBps: 0,
        discountTriggerId: incentive.offerId,
      };
    });
}

function evaluateCandidate(
  snapshot: CatalogSnapshot,
  draft: CandidateDraft,
  intent: NormalizedCustomerIntent,
): OfferCandidate {
  const profit = calculateProfit(snapshot, draft.lines, draft.incentiveCostPaise ?? 0);
  const productIds = profit.lines.map((line) => line.productId);
  const requiredBundleComponents = resolveRequiredBundleComponents(snapshot, draft.lines);
  const nonBundleProductIds = productIds.filter(
    (productId) => snapshot.products.get(productId)?.productType.toLowerCase() !== "bundle",
  );
  const policyProductIds = [
    ...nonBundleProductIds,
    ...requiredBundleComponents.map((component) => component.productId),
  ];
  const compatibility = evaluateCompatibility(snapshot, policyProductIds);
  const guardResults: GuardResult[] = [];

  const activeAndStock = draft.lines.every((line) => {
    const variant = snapshot.variants.get(line.variantId);
    return Boolean(variant?.active && variant.stockQuantity >= line.quantity);
  });
  guardResults.push(guard("ACTIVE_AND_IN_STOCK", activeAndStock, "OUT_OF_STOCK", "All variants must be active and in stock"));

  const bundleComponentsAvailable =
    requiredBundleComponents.length === 0 ||
    requiredBundleComponents.every((component) => {
      const variant = snapshot.variants.get(component.variantId);
      return component.active && Boolean(variant?.active && variant.stockQuantity >= component.quantity);
    });
  guardResults.push(
    guard(
      "BUNDLE_COMPONENTS_AVAILABLE",
      bundleComponentsAvailable,
      "BUNDLE_COMPONENT_UNAVAILABLE",
      requiredBundleComponents.length > 0
        ? "Every required bundle component must be active and individually in stock."
        : "This candidate is not a prepriced bundle.",
    ),
  );

  const customerConstraints = evaluateCustomerConstraints(snapshot, policyProductIds, intent);
  guardResults.push(
    guard(
      "CUSTOMER_EXCLUSIONS",
      customerConstraints.passed,
      customerConstraints.reasonCodes[0] ?? "CUSTOMER_EXCLUSION_MATCH",
      customerConstraints.details.join(" ") || "No explicit customer exclusion matched.",
    ),
  );

  const compatibilityPassed =
    draft.candidateType === "requested_product_only" && compatibility.unmatchedPairs.length > 0
      ? true
      : !["clarify", "block_auto_bundle", "manual_review"].includes(compatibility.decision);
  guardResults.push(guard("CATALOG_COMPATIBILITY", compatibilityPassed, "COMPATIBILITY_BLOCKED", `Compatibility result: ${compatibility.decision}`));

  const relevancePassed = candidateIsRelevant(snapshot, draft, cartProductIds(snapshot, draft.lines));
  guardResults.push(
    guard(
      "RELEVANCE",
      relevancePassed,
      "IRRELEVANT_TO_CUSTOMER_GOAL",
      relevancePassed
        ? "The candidate preserves the requested cart or adds only a catalog-declared relationship."
        : "The candidate did not have a direct catalog relationship to the requested cart.",
    ),
  );

  const discountPassed = passesDiscountPolicy(snapshot, draft);
  guardResults.push(
    guard(
      "DISCOUNT_POLICY",
      discountPassed,
      "DISCOUNT_POLICY_REJECTED",
      discountPassed
        ? "The discount uses one eligible policy source and stays within every variant cap."
        : "The discount failed its trigger, ladder, cap, stacking, or prepriced-bundle rule.",
    ),
  );

  const crossSellLimitPassed =
    draft.candidateType !== "compatible_cross_sell" ||
    draft.addedProductIds.length <= snapshot.discountPolicy.maximumCrossSellItemsPerCycle;
  guardResults.push(
    guard(
      "CROSS_SELL_LIMIT",
      crossSellLimitPassed,
      "CROSS_SELL_LIMIT_EXCEEDED",
      `A maximum of ${snapshot.discountPolicy.maximumCrossSellItemsPerCycle} cross-sell item is allowed per cycle.`,
    ),
  );

  const budgetPassed = intent.budgetPaise === null || profit.netRevenuePaise <= intent.budgetPaise;
  guardResults.push(guard("CUSTOMER_BUDGET", budgetPassed, "BUDGET_EXCEEDED", intent.budgetPaise === null ? "No explicit budget" : `${profit.netRevenuePaise} paise compared with budget ${intent.budgetPaise}`));

  const variantFloorPassed = profit.lines.every((line) => line.meetsVariantFloor);
  guardResults.push(guard("VARIANT_CONTRIBUTION_FLOOR", variantFloorPassed, "BELOW_VARIANT_MARGIN_FLOOR", "Every line must meet its configured contribution floor"));

  const cartProfitPassed = profit.contributionProfitPaise >= snapshot.profitPolicy.cartMinimumContributionProfitPaise;
  guardResults.push(guard("CART_PROFIT_FLOOR", cartProfitPassed, "BELOW_CART_PROFIT_FLOOR", "Cart must meet the absolute contribution floor"));

  const cartMarginPassed = profit.contributionMarginBps >= snapshot.profitPolicy.cartMinimumContributionMarginBps;
  guardResults.push(guard("CART_MARGIN_FLOOR", cartMarginPassed, "BELOW_CART_MARGIN_FLOOR", "Cart must meet the percentage contribution floor"));

  const weights = rankingWeights(draft, compatibility, intent, profit);
  const finalOfferScoreUnits = calculateScore(snapshot, profit.contributionProfitPaise, weights);
  const rejectionReasonCodes = guardResults.filter((result) => !result.passed).map((result) => result.reasonCode as string);

  return {
    ...draft,
    status: rejectionReasonCodes.length > 0 ? "rejected" : draft.candidateType === "requested_product_only" ? "baseline" : "eligible",
    productIds,
    profit,
    ranking: { ...weights, finalOfferScoreUnits, scoreIsProbability: false },
    compatibility,
    guardResults,
    rejectionReasonCodes,
    customerSavingPaise: profit.discountCostPaise,
    incrementalContributionProfitPaise: 0,
    offerScoreDeltaUnits: 0,
    offerScoreImprovementBps: 0,
  };
}

function compareWithBaseline(
  snapshot: CatalogSnapshot,
  candidate: OfferCandidate,
  baseline: OfferCandidate,
): OfferCandidate {
  const incrementalProfit = candidate.profit.contributionProfitPaise - baseline.profit.contributionProfitPaise;
  const scoreDelta = candidate.ranking.finalOfferScoreUnits - baseline.ranking.finalOfferScoreUnits;
  const improvementBps = roundHalfUp(
    scoreDelta * 10_000,
    Math.max(Math.abs(baseline.ranking.finalOfferScoreUnits), 1),
  );

  if (
    candidate.candidateId !== baseline.candidateId &&
    baseline.status !== "rejected" &&
    candidate.status !== "rejected"
  ) {
    if (incrementalProfit < snapshot.profitPolicy.minimumIncrementalContributionProfitPaise) {
      candidate.guardResults.push(guard("INCREMENTAL_PROFIT", false, "INSUFFICIENT_INCREMENTAL_PROFIT", "The offer did not clear the incremental-profit floor"));
      candidate.rejectionReasonCodes.push("INSUFFICIENT_INCREMENTAL_PROFIT");
      candidate.status = "rejected";
    } else if (improvementBps < snapshot.profitPolicy.minimumOfferScoreImprovementBps) {
      candidate.guardResults.push(guard("OFFER_SCORE_IMPROVEMENT", false, "INSUFFICIENT_SCORE_IMPROVEMENT", "The offer did not clear the score-improvement floor"));
      candidate.rejectionReasonCodes.push("INSUFFICIENT_SCORE_IMPROVEMENT");
      candidate.status = "rejected";
    }
  }

  return {
    ...candidate,
    incrementalContributionProfitPaise: incrementalProfit,
    offerScoreDeltaUnits: scoreDelta,
    offerScoreImprovementBps: improvementBps,
  };
}

function chooseCandidate(candidates: readonly OfferCandidate[]): OfferCandidate {
  const eligible = candidates.filter((candidate) => candidate.status !== "rejected");
  if (eligible.length === 0) return candidates[0];
  return [...eligible].sort((left, right) =>
    right.ranking.finalOfferScoreUnits - left.ranking.finalOfferScoreUnits ||
    right.profit.contributionProfitPaise - left.profit.contributionProfitPaise ||
    left.profit.discountCostPaise - right.profit.discountCostPaise ||
    left.addedProductIds.length - right.addedProductIds.length ||
    left.profit.netRevenuePaise - right.profit.netRevenuePaise ||
    left.candidateId.localeCompare(right.candidateId),
  )[0];
}

function rankingWeights(
  draft: CandidateDraft,
  compatibility: CompatibilityEvaluation,
  intent: NormalizedCustomerIntent,
  profit: ProfitBreakdown,
): Omit<OfferRanking, "finalOfferScoreUnits" | "scoreIsProbability"> {
  const isBaseline = draft.candidateType === "requested_product_only";
  const isSubstitute = draft.candidateType === "lower_price_substitute";
  const isDiscount = draft.lines.some((line) => (line.lineDiscountPaise ?? 0) > 0);
  const relevanceWeightBps = isBaseline || isDiscount ? 10_000 : isSubstitute ? 9_000 : 9_500;
  const compatibilityWeightBps = compatibility.decision === "separate_use" ? 9_000 : 10_000;
  const budgetFitWeightBps = intent.budgetPaise === null ? 9_500 : profit.netRevenuePaise <= intent.budgetPaise ? 10_000 : 0;
  const intentWeightBps = isBaseline ? 9_000 : isSubstitute ? 8_500 : draft.candidateType === "compatible_cross_sell" ? 9_000 : 9_500;
  return {
    relevanceWeightBps,
    compatibilityWeightBps,
    budgetFitWeightBps,
    intentWeightBps,
    frictionPenaltyUnits: draft.addedProductIds.length * 500 + (isDiscount ? 250 : 0) + (compatibility.decision === "separate_use" ? 250 : 0),
    riskPenaltyUnits: 0,
  };
}

function calculateScore(
  snapshot: CatalogSnapshot,
  profitPaise: number,
  weights: Omit<OfferRanking, "finalOfferScoreUnits" | "scoreIsProbability">,
): number {
  if (profitPaise <= 0 || Object.values(weights).slice(0, 4).some((weight) => weight === 0)) return 0;
  const numerator =
    BigInt(profitPaise) *
    BigInt(snapshot.profitPolicy.scoreScaleFactor) *
    BigInt(weights.relevanceWeightBps) *
    BigInt(weights.compatibilityWeightBps) *
    BigInt(weights.budgetFitWeightBps) *
    BigInt(weights.intentWeightBps);
  const weighted = ceilRatio(numerator, 10_000n ** 4n);
  return weighted - weights.frictionPenaltyUnits - weights.riskPenaltyUnits;
}

function explainForCustomer(
  snapshot: CatalogSnapshot,
  selected: OfferCandidate,
  baseline: OfferCandidate,
): OfferDecision["customerExplanation"] {
  if (selected.candidateId === baseline.candidateId) {
    return {
      headline: "Your cart is already the best valid choice",
      summary: "No additional product or discount cleared every relevance, compatibility, and value rule.",
      offerReason: "CartPilot kept the original cart instead of showing a weaker offer.",
      discountMessage: null,
      safetyNotes: selected.compatibility.reasons,
      disclosesInternalCosts: false,
    };
  }
  const addedNames = selected.addedProductIds
    .map((productId) => snapshot.products.get(productId)?.productName)
    .filter(Boolean)
    .join(", ");
  const headline = selected.bundleProductId
    ? `Complete the routine with ${snapshot.products.get(selected.bundleProductId)?.productName ?? "a starter kit"}`
    : selected.candidateType === "lower_price_substitute"
      ? "A lower-priced compatible option"
      : selected.candidateType.includes("discount") || selected.candidateType === "threshold_incentive"
        ? "A bounded discount that fits the rules"
        : `Add ${addedNames || "one compatible product"}`;
  return {
    headline,
    summary: `Your updated total is ${formatInr(selected.profit.netRevenuePaise)}.`,
    offerReason: selected.bundleProductId
      ? "This catalog bundle completes the routine and passed stock, compatibility, budget, and margin checks."
      : "This option is relevant to the current routine and passed every merchant-controlled guard.",
    discountMessage: selected.customerSavingPaise > 0 ? `You save ${formatInr(selected.customerSavingPaise)}.` : null,
    safetyNotes: selected.compatibility.reasons,
    disclosesInternalCosts: false,
  };
}

function explainForMerchant(
  selected: OfferCandidate,
  candidates: readonly OfferCandidate[],
): OfferDecision["merchantExplanation"] {
  return {
    selectedRationale: `${selected.candidateId} had the highest deterministic score among candidates that passed every applicable hard gate. No randomness or LLM-selected pricing was used.`,
    selectedContributionProfitPaise: selected.profit.contributionProfitPaise,
    incrementalContributionProfitPaise: selected.incrementalContributionProfitPaise,
    rejectedCandidateIds: candidates.filter((candidate) => candidate.status === "rejected").map((candidate) => candidate.candidateId),
    primaryRejectionReasonCodes: [...new Set(candidates.flatMap((candidate) => candidate.rejectionReasonCodes))],
  };
}

function guard(ruleId: string, passed: boolean, reasonCode: string, detail: string): GuardResult {
  return { ruleId, passed, reasonCode: passed ? null : reasonCode, detail };
}

function defaultVariant(snapshot: CatalogSnapshot, productId: string): ProductVariant | null {
  return [...snapshot.variants.values()]
    .filter((variant) => variant.productId === productId && variant.active && variant.stockQuantity > 0)
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.pricePaise - right.pricePaise || left.variantId.localeCompare(right.variantId))[0] ?? null;
}

function cartProductIds(
  snapshot: CatalogSnapshot,
  lines: readonly PricedCandidateLine[],
): string[] {
  return lines.map((line) => variantOrThrow(snapshot, line.variantId).productId);
}

function candidateIsRelevant(
  snapshot: CatalogSnapshot,
  draft: CandidateDraft,
  candidateProductIds: readonly string[],
): boolean {
  if (["requested_product_only", "discounted_product", "threshold_incentive"].includes(draft.candidateType)) {
    return true;
  }
  if (draft.candidateType === "prepriced_catalog_bundle") {
    return Boolean(draft.bundleComponents && draft.bundleComponents.length >= 2 && draft.addedProductIds.length > 0);
  }
  if (draft.candidateType === "lower_price_substitute") {
    const targetProductId = draft.addedProductIds[0];
    return Boolean(
      targetProductId &&
      snapshot.compatibilityRules.some(
        (rule) =>
          rule.relationshipType === "substitute_for" &&
          (rule.sourceProductId === targetProductId || rule.targetProductId === targetProductId),
      ),
    );
  }
  if (draft.candidateType !== "compatible_cross_sell" || draft.addedProductIds.length !== 1) return false;

  const addedProductId = draft.addedProductIds[0];
  const originalProductIds = candidateProductIds.filter((productId) => productId !== addedProductId);
  return originalProductIds.some((productId) =>
    snapshot.compatibilityRules.some(
      (rule) =>
        rule.relationshipType === "complements" &&
        rule.safetyAction === "allow" &&
        ((rule.sourceProductId === productId && rule.targetProductId === addedProductId) ||
          (rule.directionality === "bidirectional" &&
            rule.sourceProductId === addedProductId &&
            rule.targetProductId === productId)),
    ),
  );
}

function passesDiscountPolicy(snapshot: CatalogSnapshot, draft: CandidateDraft): boolean {
  const discountedLines = draft.lines.filter((line) => (line.lineDiscountPaise ?? 0) > 0);
  if (discountedLines.length === 0) return draft.discountTriggerId === null;
  if (snapshot.discountPolicy.maximumDynamicDiscountsPerSession < 1) return false;
  if (
    !snapshot.discountPolicy.allowAdditionalDiscountOnPrepricedBundles &&
    containsPrepricedBundle(snapshot, draft.lines)
  ) return false;

  const threshold = snapshot.discountPolicy.thresholdIncentives.find(
    (incentive) => incentive.offerId === draft.discountTriggerId && incentive.enabled,
  );
  const trigger = snapshot.discountPolicy.triggers.find(
    (item) => item.triggerId === draft.discountTriggerId && item.enabled,
  );
  if (!threshold && !trigger) return false;
  if (!snapshot.discountPolicy.allowDiscountStacking && Number(Boolean(threshold)) + Number(Boolean(trigger)) > 1) {
    return false;
  }
  if (
    trigger &&
    (!trigger.allowedDiscountBps.includes(draft.discountRateBps) ||
      !snapshot.discountPolicy.discountLadderBps.includes(draft.discountRateBps))
  ) return false;

  return discountedLines.every((line) => {
    const variant = variantOrThrow(snapshot, line.variantId);
    const economics = snapshot.economics.get(line.variantId);
    const lineSubtotal = variant.pricePaise * line.quantity;
    return Boolean(
      economics &&
      (line.lineDiscountPaise ?? 0) * 10_000 <= lineSubtotal * economics.maxDiscountBps,
    );
  });
}

function containsPrepricedBundle(
  snapshot: CatalogSnapshot,
  lines: readonly PricedCandidateLine[],
): boolean {
  return lines.some((line) => {
    const variant = snapshot.variants.get(line.variantId);
    const product = variant ? snapshot.products.get(variant.productId) : null;
    return product?.productType.toLowerCase() === "bundle";
  });
}

function resolveRequiredBundleComponents(
  snapshot: CatalogSnapshot,
  lines: readonly PricedCandidateLine[],
): Array<{ productId: string; variantId: string; quantity: number; active: boolean }> {
  return lines.flatMap((line) => {
    const variant = snapshot.variants.get(line.variantId);
    const product = variant ? snapshot.products.get(variant.productId) : null;
    if (product?.productType.toLowerCase() !== "bundle") return [];
    return snapshot.bundleComponents
      .filter((component) => component.bundleVariantId === line.variantId && component.required)
      .map((component) => ({
        productId: component.componentProductId,
        variantId: component.componentVariantId,
        quantity: component.quantity * line.quantity,
        active: component.active,
      }));
  });
}

function sanitizeIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function variantOrThrow(snapshot: CatalogSnapshot, variantId: string): ProductVariant {
  const variant = snapshot.variants.get(variantId);
  if (!variant) throw new Error(`Unknown variant ${variantId}`);
  return variant;
}

function allocateDiscount(total: number, subtotals: readonly number[]): number[] {
  const gross = sum(subtotals);
  const allocations = subtotals.map((subtotal) => Math.floor((total * subtotal) / gross));
  let remainder = total - sum(allocations);
  const order = subtotals.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value || left.index - right.index);
  for (let index = 0; remainder > 0; index = (index + 1) % order.length) {
    allocations[order[index].index] += 1;
    remainder -= 1;
  }
  return allocations;
}

function deduplicateDrafts(drafts: readonly CandidateDraft[]): CandidateDraft[] {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = JSON.stringify([...draft.lines].sort((left, right) => left.variantId.localeCompare(right.variantId)));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateCart(lines: readonly CartLineInput[]): void {
  if (lines.length === 0 || lines.length > 20) throw new Error("Cart must contain between 1 and 20 lines");
  const seen = new Set<string>();
  for (const line of lines) {
    if (!/^(CLN|SRM|MST|SUN|TON|EXF|ACN|MSK|EYE|LIP|BND)-[0-9]{3}-[A-Z0-9]+$/.test(line.variantId)) {
      throw new Error(`Invalid variant identifier ${line.variantId}`);
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) throw new Error(`Invalid quantity for ${line.variantId}`);
    if (seen.has(line.variantId)) throw new Error(`Duplicate cart line ${line.variantId}`);
    seen.add(line.variantId);
  }
}

function createDecisionId(lines: readonly CartLineInput[], intent: NormalizedCustomerIntent): string {
  const source = `${lines.map((line) => `${line.variantId}:${line.quantity}`).sort().join("|")}|${intent.messageSummary}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `DEC-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function sum(values: readonly number[]): number {
  const total = values.reduce((accumulator, value) => accumulator + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Integer calculation exceeded the safe range");
  return total;
}
