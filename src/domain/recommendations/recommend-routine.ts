import type { CatalogSnapshot, ProductProfile, ProductVariant } from "@/domain/catalog/types";
import { evaluateCompatibility } from "@/domain/compatibility/evaluate-compatibility";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";
import { evaluateCustomerConstraints } from "@/domain/policies/customer-constraints";

export interface RoutineRecommendationItem {
  productId: string;
  variantId: string;
  productName: string;
  productType: string;
  size: string;
  pricePaise: number;
  routineStep: string;
  routineOrder: number;
  reason: string;
  warning: string | null;
}

export interface RoutineRecommendation {
  status: "ready" | "clarification_required" | "professional_guidance" | "no_match";
  headline: string;
  summary: string;
  items: RoutineRecommendationItem[];
  compatibilityRuleIds: string[];
  safetyNotes: string[];
  clarificationQuestion: string | null;
}

const preferredStepOrder = ["cleanse", "tone_or_hydrate", "tone_or_soothe", "tone_or_treat", "hydrate", "treat", "moisturize", "protect"];

export function recommendRoutine(
  snapshot: CatalogSnapshot,
  intent: NormalizedCustomerIntent,
): RoutineRecommendation {
  if (intent.needsProfessionalGuidance) {
    return {
      status: "professional_guidance",
      headline: "A professional should help with this concern",
      summary: "CartPilot does not diagnose or recommend products for disclosed skin damage or medical concerns.",
      items: [],
      compatibilityRuleIds: [],
      safetyNotes: ["Please consult a qualified professional before trying new active products."],
      clarificationQuestion: null,
    };
  }

  if (intent.clarificationQuestion) {
    return {
      status: "clarification_required",
      headline: "One detail will help",
      summary: "CartPilot needs a little more information before building a routine.",
      items: [],
      compatibilityRuleIds: [],
      safetyNotes: [],
      clarificationQuestion: intent.clarificationQuestion,
    };
  }

  const rankedProducts = [...snapshot.profiles.values()]
    .filter((profile) => profile.routineStep !== "multi_step_bundle")
    .map((profile) => ({ profile, score: scoreProfile(snapshot, profile, intent) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score || left.profile.routineOrder - right.profile.routineOrder || left.profile.productId.localeCompare(right.profile.productId),
    );

  const desiredSteps = chooseDesiredSteps(intent);
  const selected: { profile: ProductProfile; variant: ProductVariant }[] = [];
  for (const step of desiredSteps) {
    const stepCandidates = rankedProducts.filter(
      ({ profile }) =>
        stepMatches(profile.routineStep, step) &&
        !selected.some((item) => item.profile.productId === profile.productId),
    );
    for (const candidate of stepCandidates) {
      const variant = defaultAvailableVariant(snapshot, candidate.profile.productId);
      if (!variant) continue;
      const trialIds = [...selected.map((item) => item.profile.productId), candidate.profile.productId];
      const compatibility = evaluateCompatibility(snapshot, trialIds);
      const constraints = evaluateCustomerConstraints(snapshot, trialIds, intent);
      if (
        !constraints.passed ||
        ["clarify", "block_auto_bundle", "manual_review"].includes(compatibility.decision)
      ) continue;
      selected.push({ profile: candidate.profile, variant });
      break;
    }
  }

  if (selected.length === 0) {
    return {
      status: "no_match",
      headline: "No safe catalog match was found",
      summary: "Try a different concern or browse the catalog directly.",
      items: [],
      compatibilityRuleIds: [],
      safetyNotes: ["CartPilot never invents a product when the catalog does not contain a valid match."],
      clarificationQuestion: null,
    };
  }

  const compatibility = evaluateCompatibility(snapshot, selected.map((item) => item.profile.productId));
  const items = selected
    .sort((left, right) => left.profile.routineOrder - right.profile.routineOrder)
    .map(({ profile, variant }): RoutineRecommendationItem => {
      const product = snapshot.products.get(profile.productId);
      if (!product) throw new Error(`Missing product ${profile.productId}`);
      return {
        productId: product.productId,
        variantId: variant.variantId,
        productName: product.productName,
        productType: product.productType,
        size: variant.size,
        pricePaise: variant.pricePaise,
        routineStep: profile.routineStep,
        routineOrder: profile.routineOrder,
        reason: explainMatch(profile, intent),
        warning: profile.customerWarning || null,
      };
    });

  return {
    status: "ready",
    headline: buildHeadline(intent),
    summary: `A ${items.length}-step routine selected from active, in-stock catalog products.`,
    items,
    compatibilityRuleIds: compatibility.matchedRuleIds,
    safetyNotes: [
      "Use products only as directed on their labels.",
      "Patch-test new products and stop use if irritation occurs.",
      ...compatibility.reasons,
    ],
    clarificationQuestion: null,
  };
}

function scoreProfile(snapshot: CatalogSnapshot, profile: ProductProfile, intent: NormalizedCustomerIntent): number {
  const product = snapshot.products.get(profile.productId);
  if (!product || product.status !== "active") return 0;
  if (!defaultAvailableVariant(snapshot, profile.productId)) return 0;
  if (!evaluateCustomerConstraints(snapshot, [profile.productId], intent).passed) return 0;

  const skinScore = overlap(profile.supportedSkinTypes, intent.skinTypes) * 30;
  const concernScore = overlap(profile.supportedConcerns, intent.concerns) * 40;
  const typeKey = product.productType.toLowerCase().replaceAll(" ", "_");
  const requestScore = intent.requestedProductTypes.includes(typeKey) ? 60 : 0;
  const directMatchScore = intent.matchedProductIds.includes(product.productId) ? 100 : 0;
  return skinScore + concernScore + requestScore + directMatchScore + Math.max(0, 20 - profile.routineOrder);
}

function chooseDesiredSteps(intent: NormalizedCustomerIntent): string[] {
  if (intent.requestedProductTypes.length > 0 && intent.shoppingGoal === "find_single_product") {
    return intent.requestedProductTypes.map(productTypeToStep);
  }
  if (intent.concerns.includes("sun_protection")) return ["cleanse", "moisturize", "protect"];
  return preferredStepOrder.filter((step) => ["cleanse", "treat", "moisturize", "protect"].includes(step));
}

function productTypeToStep(productType: string): string {
  const mapping: Record<string, string> = {
    cleanser: "cleanse",
    toner: "tone",
    serum: "treat",
    moisturizer: "moisturize",
    sunscreen: "protect",
    exfoliant: "exfoliate",
    acne_treatment: "spot_treat",
    mask: "mask",
    eye_care: "eye_care",
    lip_care: "lip_care",
  };
  return mapping[productType] ?? productType;
}

function stepMatches(profileStep: string, desiredStep: string): boolean {
  return profileStep === desiredStep || profileStep.split("_or_").includes(desiredStep) || desiredStep === "tone" && profileStep.startsWith("tone_");
}

function defaultAvailableVariant(snapshot: CatalogSnapshot, productId: string): ProductVariant | null {
  const variants = [...snapshot.variants.values()]
    .filter((variant) => variant.productId === productId && variant.active && variant.stockQuantity > 0)
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.pricePaise - right.pricePaise || left.variantId.localeCompare(right.variantId));
  return variants[0] ?? null;
}

function overlap(left: readonly string[], right: readonly string[]): number {
  return left.filter((value) => right.includes(value)).length;
}

function explainMatch(profile: ProductProfile, intent: NormalizedCustomerIntent): string {
  const matchedConcerns = profile.supportedConcerns.filter((concern) => intent.concerns.includes(concern));
  if (matchedConcerns.length > 0) return `Matches your ${matchedConcerns[0].replaceAll("_", " ")} goal.`;
  return `Fills the ${profile.routineStep.replaceAll("_", " ")} step in the routine.`;
}

function buildHeadline(intent: NormalizedCustomerIntent): string {
  const skinType = intent.skinTypes.find((value) => value !== "unknown");
  const concern = intent.concerns.find((value) => value !== "daily_cleansing");
  if (skinType && concern) return `A simple routine for ${skinType} skin and ${concern.replaceAll("_", " ")}`;
  if (skinType) return `A simple routine for ${skinType} skin`;
  return "A simple catalog-backed routine";
}
