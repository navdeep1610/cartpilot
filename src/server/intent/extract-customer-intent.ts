import geminiIntentSchema from "../../../schemas/gemini_intent_schema.json" with { type: "json" };
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import type { NormalizedCustomerIntent, PriceSignal } from "@/domain/intent/types";
import { inrToPaise } from "@/domain/money";

interface StructuredIntent {
  customer_message_summary: string;
  shopping_goal: NormalizedCustomerIntent["shoppingGoal"];
  requested_items: Array<{
    product_type: string;
    matched_catalog_product_ids: string[];
  }>;
  skin_profile: { skin_types: string[]; concerns: string[] };
  shopping_constraints: {
    avoid_strong_actives: boolean;
    product_type_exclusions: string[];
    ingredient_exclusions: string[];
  };
  price_context: { signal: PriceSignal; budget_inr: number | null };
  safety_context: { needs_professional_guidance: boolean };
  clarification: { required: boolean; question: string | null };
}

const shoppingGoals = new Set<NormalizedCustomerIntent["shoppingGoal"]>([
  "find_single_product",
  "compare_products",
  "complete_routine",
  "add_complementary_product",
  "find_substitute",
  "find_lower_price_option",
  "request_discount",
  "review_cart",
  "start_checkout",
  "unknown",
]);
const priceSignals = new Set<PriceSignal>([
  "none",
  "explicit_budget",
  "explicit_price_objection",
  "explicit_discount_request",
  "explicit_lower_price_request",
]);

export async function extractCustomerIntent(
  message: string,
  snapshot: CatalogSnapshot,
): Promise<NormalizedCustomerIntent> {
  const fallback = extractFallbackIntent(message);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fallback;

  try {
    const catalogNames = [...snapshot.products.values()]
      .filter((product) => product.status === "active")
      .map((product) => `${product.productId}: ${product.productName} (${product.productType})`)
      .join("\n");
    const prompt = [
      "Extract only explicitly stated shopping intent. Do not diagnose, invent skin conditions, infer income, choose discounts, or authorize a purchase.",
      "Use only product IDs from this public catalog when a direct match is clear:",
      catalogNames,
      `Shopper message: ${message}`,
    ].join("\n\n");
    const responseText = await requestGeminiIntent(
      apiKey,
      process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      prompt,
    );
    const parsed: unknown = JSON.parse(responseText);
    if (!isStructuredIntent(parsed)) {
      console.warn("[CartPilot Gemini] Structured intent failed local validation.");
      return fallback;
    }
    return normalizeStructuredIntent(parsed, snapshot);
  } catch (error) {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    const providerStatus = getProviderStatus(error);
    const providerDetail = getSafeProviderDetail(error, apiKey);
    console.warn(
      `[CartPilot Gemini] Intent extraction used the deterministic fallback. errorType=${errorType} providerStatus=${providerStatus ?? "none"} detail=${providerDetail}`,
    );
    return fallback;
  }
}

async function requestGeminiIntent(apiKey: string, model: string, prompt: string): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: geminiIntentSchema,
      },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
    throw new GeminiRequestError(response.status, `Gemini request failed: ${detail}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new GeminiRequestError(502, "Gemini returned no structured content");
  return text;
}

class GeminiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

function isStructuredIntent(value: unknown): value is StructuredIntent {
  if (!isRecord(value)) return false;
  const profile = value.skin_profile;
  const constraints = value.shopping_constraints;
  const price = value.price_context;
  const safety = value.safety_context;
  const clarification = value.clarification;
  return (
    typeof value.customer_message_summary === "string" &&
    typeof value.shopping_goal === "string" &&
    shoppingGoals.has(value.shopping_goal as NormalizedCustomerIntent["shoppingGoal"]) &&
    Array.isArray(value.requested_items) &&
    value.requested_items.length <= 8 &&
    value.requested_items.every(
      (item) =>
        isRecord(item) &&
        typeof item.product_type === "string" &&
        isStringArray(item.matched_catalog_product_ids, 5),
    ) &&
    isRecord(profile) &&
    isStringArray(profile.skin_types, 2) &&
    isStringArray(profile.concerns, 6) &&
    isRecord(constraints) &&
    typeof constraints.avoid_strong_actives === "boolean" &&
    isStringArray(constraints.product_type_exclusions, 11) &&
    isStringArray(constraints.ingredient_exclusions, 20) &&
    isRecord(price) &&
    typeof price.signal === "string" &&
    priceSignals.has(price.signal as PriceSignal) &&
    (price.budget_inr === null ||
      (typeof price.budget_inr === "number" &&
        Number.isInteger(price.budget_inr) &&
        price.budget_inr >= 1 &&
        price.budget_inr <= 100000)) &&
    isRecord(safety) &&
    typeof safety.needs_professional_guidance === "boolean" &&
    isRecord(clarification) &&
    typeof clarification.required === "boolean" &&
    (clarification.question === null || typeof clarification.question === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxLength && value.every((item) => typeof item === "string");
}

function getProviderStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

function getSafeProviderDetail(error: unknown, apiKey: string): string {
  if (!(error instanceof Error)) return "unavailable";
  return error.message
    .replaceAll(apiKey, "[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]+/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 600);
}

function normalizeStructuredIntent(
  intent: StructuredIntent,
  snapshot: CatalogSnapshot,
): NormalizedCustomerIntent {
  const matchedProductIds = [
    ...new Set(intent.requested_items.flatMap((item) => item.matched_catalog_product_ids)),
  ].filter((productId) => snapshot.products.has(productId));
  const requestedProductTypes = [
    ...new Set(intent.requested_items.map((item) => item.product_type).filter((item) => item !== "unknown")),
  ];

  return {
    messageSummary: intent.customer_message_summary,
    shoppingGoal: intent.shopping_goal,
    requestedProductTypes,
    matchedProductIds,
    skinTypes: intent.skin_profile.skin_types,
    concerns: intent.skin_profile.concerns,
    budgetPaise: intent.price_context.budget_inr === null ? null : inrToPaise(intent.price_context.budget_inr),
    priceSignal: intent.price_context.signal,
    avoidStrongActives: intent.shopping_constraints.avoid_strong_actives,
    productTypeExclusions: intent.shopping_constraints.product_type_exclusions,
    ingredientExclusions: intent.shopping_constraints.ingredient_exclusions,
    needsProfessionalGuidance: intent.safety_context.needs_professional_guidance,
    clarificationQuestion: intent.clarification.required ? intent.clarification.question : null,
    source: "gemini",
  };
}
