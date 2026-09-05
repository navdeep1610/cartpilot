import { describe, expect, it } from "vitest";
import {
  buildShopperIntentMessage,
  formatConversationTranscript,
} from "@/domain/agents/conversation-context";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";

describe("shopping conversation context", () => {
  const conversation = [
    { role: "shopper" as const, message: "its oily" },
    { role: "assistant" as const, message: "What product or routine can I help you find?" },
    { role: "shopper" as const, message: "facewash" },
    { role: "assistant" as const, message: "Do you want a specific type of cleanser?" },
  ];

  it("retains explicit shopper facts across a third typed message", () => {
    const intent = extractFallbackIntent(
      buildShopperIntentMessage(conversation, "which one is better for my skin type"),
    );

    expect(intent.skinTypes).toContain("oily");
    expect(intent.requestedProductTypes).toContain("cleanser");
    expect(intent.clarificationQuestion).toBeNull();
  });

  it("keeps assistant turns labeled instead of treating them as shopper claims", () => {
    expect(formatConversationTranscript(conversation, "which one is better")).toContain(
      "CARTPILOT: What product or routine can I help you find?",
    );
  });

  it("bounds the shopper context sent to commerce rules", () => {
    const result = buildShopperIntentMessage(
      [{ role: "shopper", message: "a".repeat(800) }],
      "b".repeat(800),
      1_000,
    );

    expect(result.length).toBeLessThanOrEqual(1_000);
    expect(result.endsWith("b".repeat(800))).toBe(true);
  });
});
