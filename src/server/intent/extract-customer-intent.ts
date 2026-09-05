import { GoogleGenAI } from "@google/genai";
import Ajv2020 from "ajv/dist/2020.js";
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

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateStructuredIntent = ajv.compile(geminiIntentSchema);

export async function extractCustomerIntent(
  message: string,
  snapshot: CatalogSnapshot,
): Promise<NormalizedCustomerIntent> {
  const fallback = extractFallbackIntent(message);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.GEMINI_DISABLED === "true") return fallback;

  try {
    const catalogNames = [...snapshot.products.values()]
      .filter((product) => product.status === "active")
      .map((product) => `${product.productId}: ${product.productName} (${product.productType})`)
      .join("\n");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      contents: [
        "Extract only explicitly stated shopping intent. Do not diagnose, invent skin conditions, infer income, choose discounts, or authorize a purchase.",
        "Use only product IDs from this public catalog when a direct match is clear:",
        catalogNames,
        `Shopper message: ${message}`,
      ].join("\n\n"),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: geminiIntentSchema,
      },
    });
    const parsed = JSON.parse(response.text ?? "null") as StructuredIntent;
    if (!validateStructuredIntent(parsed)) {
      const issues = validateStructuredIntent.errors
        ?.map(({ instancePath, keyword }) => `${instancePath || "/"}:${keyword}`)
        .join(",");
      console.warn(`[CartPilot Gemini] Structured intent failed local validation. issues=${issues || "unknown"}`);
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
