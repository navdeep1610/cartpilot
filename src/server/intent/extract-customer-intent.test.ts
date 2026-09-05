import { describe, expect, it } from "vitest";
import geminiIntentSchema from "../../../schemas/gemini_intent_schema.json" with { type: "json" };
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { extractCustomerIntent } from "./extract-customer-intent";

describe("Gemini intent schema", () => {
  it("stays within Gemini's supported JSON Schema subset", () => {
    const unsupportedKeywords = new Set(["$schema", "$defs", "$ref", "allOf", "if", "then", "pattern"]);
    const found = new Set<string>();

    visitSchema(geminiIntentSchema, (key) => {
      if (unsupportedKeywords.has(key)) found.add(key);
    });

    expect([...found]).toEqual([]);
    expect(geminiIntentSchema.required).toContain("shopping_goal");
    expect(geminiIntentSchema.required).toContain("requested_items");
  });

  it("uses the deterministic fallback when the provider circuit breaker is enabled", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    const previousDisabled = process.env.GEMINI_DISABLED;
    process.env.GEMINI_API_KEY = "not-a-real-key";
    process.env.GEMINI_DISABLED = "true";

    try {
      const intent = await extractCustomerIntent(
        "I have oily skin and clogged pores",
        await loadCatalogSnapshot(),
      );
      expect(intent.source).toBe("deterministic_fallback");
      expect(intent.skinTypes).toContain("oily");
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
      if (previousDisabled === undefined) delete process.env.GEMINI_DISABLED;
      else process.env.GEMINI_DISABLED = previousDisabled;
    }
  });

  it("preserves earlier shopper facts for a later typed question", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    const previousDisabled = process.env.GEMINI_DISABLED;
    process.env.GEMINI_API_KEY = "not-a-real-key";
    process.env.GEMINI_DISABLED = "true";

    try {
      const intent = await extractCustomerIntent(
        "which one is better for my skin type",
        await loadCatalogSnapshot(),
        [
          { role: "shopper", message: "its oily" },
          { role: "assistant", message: "What product or routine can I help you find?" },
          { role: "shopper", message: "facewash" },
          { role: "assistant", message: "Are you looking for a specific cleanser type?" },
        ],
      );

      expect(intent.skinTypes).toContain("oily");
      expect(intent.requestedProductTypes).toContain("cleanser");
      expect(intent.clarificationQuestion).toBeNull();
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
      if (previousDisabled === undefined) delete process.env.GEMINI_DISABLED;
      else process.env.GEMINI_DISABLED = previousDisabled;
    }
  });
});

function visitSchema(value: unknown, onKey: (key: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item) => visitSchema(item, onKey));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, item]) => {
    onKey(key);
    visitSchema(item, onKey);
  });
}
