import { describe, expect, it } from "vitest";
import geminiIntentSchema from "../../../schemas/gemini_intent_schema.json" with { type: "json" };

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
