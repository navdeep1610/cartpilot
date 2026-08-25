export type PriceSignal =
  | "none"
  | "explicit_budget"
  | "explicit_price_objection"
  | "explicit_discount_request"
  | "explicit_lower_price_request";

export interface NormalizedCustomerIntent {
  messageSummary: string;
  shoppingGoal:
    | "find_single_product"
    | "compare_products"
    | "complete_routine"
    | "add_complementary_product"
    | "find_substitute"
    | "find_lower_price_option"
    | "request_discount"
    | "review_cart"
    | "start_checkout"
    | "unknown";
  requestedProductTypes: string[];
  matchedProductIds: string[];
  skinTypes: string[];
  concerns: string[];
  budgetPaise: number | null;
  priceSignal: PriceSignal;
  avoidStrongActives: boolean;
  productTypeExclusions: string[];
  ingredientExclusions: string[];
  needsProfessionalGuidance: boolean;
  clarificationQuestion: string | null;
  source: "gemini" | "deterministic_fallback";
}
