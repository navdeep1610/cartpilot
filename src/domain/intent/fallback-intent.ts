import type { NormalizedCustomerIntent, PriceSignal } from "@/domain/intent/types";
import { inrToPaise } from "@/domain/money";

const productTerms: Record<string, string[]> = {
  cleanser: ["cleanser", "face wash", "wash face"],
  serum: ["serum"],
  moisturizer: ["moisturizer", "moisturiser", "cream"],
  sunscreen: ["sunscreen", "spf", "sun protection"],
  toner: ["toner", "tonner"],
  exfoliant: ["exfoliant", "exfoliator", "scrub"],
  acne_treatment: ["spot treatment", "acne gel"],
  mask: ["mask"],
  eye_care: ["eye cream", "eye serum", "under eye"],
  lip_care: ["lip balm", "lip care"],
  bundle: ["kit", "bundle", "routine"],
};

const concernTerms: Record<string, string[]> = {
  dryness: ["dry", "dryness"],
  dehydration: ["dehydrated", "dehydration"],
  sensitivity: ["sensitive", "sensitivity"],
  redness: ["redness", "red"],
  excess_oil: ["oily", "oil control", "excess oil"],
  acne_prone: ["acne", "pimple", "breakout"],
  clogged_pores: ["clogged pore", "blocked pore"],
  blackheads: ["blackhead"],
  visible_pores: ["large pores", "visible pores"],
  dullness: ["dull", "brighten", "glow"],
  uneven_tone: ["uneven tone", "pigmentation"],
  dark_spots_appearance: ["dark spot"],
  uneven_texture: ["texture", "rough"],
  fine_lines: ["fine line", "wrinkle"],
  barrier_support: ["barrier", "ceramide"],
  sun_protection: ["sun", "spf"],
  tired_under_eye_appearance: ["dark circle", "tired under eye"],
  dry_lips: ["dry lip", "chapped lip"],
};

const ingredientTerms: Record<string, string[]> = {
  retinoid_or_retinol: ["retinol", "retinoid"],
  benzoyl_peroxide: ["benzoyl peroxide"],
  salicylic_acid_or_bha: ["salicylic acid", "bha"],
  glycolic_or_lactic_acid_aha: ["glycolic acid", "lactic acid", "aha"],
  vitamin_c: ["vitamin c"],
  niacinamide: ["niacinamide"],
};

export function extractFallbackIntent(message: string): NormalizedCustomerIntent {
  const normalized = message.toLowerCase().trim();
  const requestedProductTypes = matchingKeys(normalized, productTerms);
  const concerns = matchingKeys(normalized, concernTerms);
  const skinTypes = ["oily", "dry", "combination", "sensitive", "normal"].filter((skinType) =>
    normalized.includes(skinType),
  );
  const budgetInr = extractBudget(normalized);
  const priceSignal = detectPriceSignal(normalized, budgetInr);
  const asksForRoutine = normalized.includes("routine") || requestedProductTypes.length > 1;
  const productTypeExclusions = matchingExcludedKeys(normalized, productTerms);
  const ingredientExclusions = matchingExcludedKeys(normalized, ingredientTerms);

  return {
    messageSummary: message.trim().slice(0, 300) || "Customer requested skincare help.",
    shoppingGoal:
      priceSignal === "explicit_discount_request"
        ? "request_discount"
        : priceSignal === "explicit_lower_price_request"
          ? "find_lower_price_option"
          : asksForRoutine || requestedProductTypes.length === 0
            ? "complete_routine"
            : "find_single_product",
    requestedProductTypes,
    matchedProductIds: [],
    skinTypes: skinTypes.length > 0 ? skinTypes : ["unknown"],
    concerns: concerns.length > 0 ? concerns : ["daily_cleansing"],
    budgetPaise: budgetInr === null ? null : inrToPaise(budgetInr),
    priceSignal,
    avoidStrongActives:
      normalized.includes("avoid strong") || normalized.includes("no strong active") || skinTypes.includes("sensitive"),
    productTypeExclusions,
    ingredientExclusions,
    needsProfessionalGuidance:
      ["open wound", "severe reaction", "skin infection", "diagnose", "prescription"].some((term) =>
        normalized.includes(term),
      ),
    clarificationQuestion:
      skinTypes.length === 0 && concerns.length === 0
        ? "What is your skin type and the main concern you want to address?"
        : null,
    source: "deterministic_fallback",
  };
}

function matchingKeys(message: string, dictionary: Record<string, string[]>): string[] {
  return Object.entries(dictionary)
    .filter(([, terms]) => terms.some((term) => message.includes(term)))
    .map(([key]) => key);
}

function matchingExcludedKeys(message: string, dictionary: Record<string, string[]>): string[] {
  return Object.entries(dictionary)
    .filter(([, terms]) => terms.some((term) => exclusionPattern(term).test(message)))
    .map(([key]) => key);
}

function exclusionPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:\\bno\\b|\\bwithout\\b|\\bavoid\\b|\\bexclude\\b|\\bdo not want\\b|\\bdon't want\\b)(?:\\s+any)?(?:\\s+products?\\s+with)?\\s+${escaped}\\b`,
    "i",
  );
}

function extractBudget(message: string): number | null {
  const match = message.match(/(?:₹|rs\.?|inr|under|budget(?:\s+of)?|below)\s*([0-9]{2,6})/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function detectPriceSignal(message: string, budgetInr: number | null): PriceSignal {
  if (/discount|coupon|offer price/.test(message)) return "explicit_discount_request";
  if (/cheaper|lower price|less expensive|affordable/.test(message)) return "explicit_lower_price_request";
  if (/too expensive|price is high|costly/.test(message)) return "explicit_price_objection";
  return budgetInr === null ? "none" : "explicit_budget";
}
