import type { CatalogSnapshot, ProductProfile } from "@/domain/catalog/types";
import type { NormalizedCustomerIntent } from "@/domain/intent/types";

export interface CustomerConstraintEvaluation {
  passed: boolean;
  reasonCodes: string[];
  details: string[];
}

const strongActivePattern = /retinol|retinoid|benzoyl|salicylic|\bbha\b|glycolic|lactic|\baha\b/i;

const ingredientFamilies: Record<string, RegExp> = {
  retinoid_or_retinol: /retinol|retinoid/i,
  benzoyl_peroxide: /benzoyl[_\s-]*peroxide/i,
  salicylic_acid_or_bha: /salicylic|\bbha\b/i,
  glycolic_or_lactic_acid_aha: /glycolic|lactic|\baha\b/i,
  vitamin_c: /vitamin[_\s-]*c|ascorb/i,
  niacinamide: /niacinamide/i,
  unknown_active: /not[_\s-]*provided|unspecified|unknown/i,
};

export function evaluateCustomerConstraints(
  snapshot: CatalogSnapshot,
  productIds: readonly string[],
  intent: NormalizedCustomerIntent,
): CustomerConstraintEvaluation {
  const reasonCodes = new Set<string>();
  const details = new Set<string>();

  for (const productId of new Set(productIds)) {
    const product = snapshot.products.get(productId);
    const profile = snapshot.profiles.get(productId);
    if (!product || !profile) {
      reasonCodes.add("DATA_INTEGRITY_ERROR");
      details.add(`Product ${productId} is missing required catalog policy data.`);
      continue;
    }

    const productType = normalizeToken(product.productType);
    if (intent.productTypeExclusions.map(normalizeToken).includes(productType)) {
      reasonCodes.add("CUSTOMER_EXCLUSION_MATCH");
      details.add(`${product.productName} matches an excluded product type.`);
    }

    if (matchesIngredientExclusion(profile, intent.ingredientExclusions)) {
      reasonCodes.add("CUSTOMER_EXCLUSION_MATCH");
      details.add(`${product.productName} matches an excluded ingredient family.`);
    }

    if (intent.avoidStrongActives && strongActivePattern.test(profile.declaredActives.join(" "))) {
      reasonCodes.add("CUSTOMER_EXCLUSION_MATCH");
      details.add(`${product.productName} contains a strong active the shopper asked to avoid.`);
    }

    if (matchesProfileExclusion(profile, intent)) {
      reasonCodes.add("SKINCARE_CLARIFICATION_REQUIRED");
      details.add(`${product.productName} requires clarification for the shopper's stated profile.`);
    }
  }

  return {
    passed: reasonCodes.size === 0,
    reasonCodes: [...reasonCodes],
    details: [...details],
  };
}

function matchesIngredientExclusion(profile: ProductProfile, exclusions: readonly string[]): boolean {
  const activeText = profile.declaredActives.join(" ");
  return exclusions.some((exclusion) => {
    const normalized = normalizeToken(exclusion);
    const familyPattern = ingredientFamilies[normalized];
    if (familyPattern) return familyPattern.test(activeText);
    return normalized.length > 1 && normalizeToken(activeText).includes(normalized);
  });
}

function matchesProfileExclusion(
  profile: ProductProfile,
  intent: NormalizedCustomerIntent,
): boolean {
  const flags = profile.exclusionFlags.map(normalizeToken);
  if (
    intent.skinTypes.includes("sensitive") &&
    flags.some((flag) => flag === "sensitive_or_irritated_skin" || flag === "currently_irritated_skin")
  ) return true;
  return false;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
