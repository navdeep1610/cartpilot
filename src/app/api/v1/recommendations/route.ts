import { randomUUID } from "node:crypto";
import {
  maximumConversationCharacters,
  maximumConversationTurns,
  type ShoppingConversationTurn,
} from "@/domain/agents/conversation-context";
import { buildShoppingAgentRun, suggestedAgentReplies } from "@/domain/agents/shopping-agent-run";
import { recommendRoutine } from "@/domain/recommendations/recommend-routine";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { extractCustomerIntent } from "@/server/intent/extract-customer-intent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; conversation?: unknown };
    if (typeof body.message !== "string" || body.message.trim().length < 3 || body.message.length > 1_000) {
      return Response.json(
        { error: "INVALID_MESSAGE", message: "Describe your skin type and one concern in a short sentence." },
        { status: 400 },
      );
    }
    const conversation = parseConversation(body.conversation);
    if (!conversation) {
      return Response.json(
        { error: "INVALID_CONVERSATION", message: "The recent conversation could not be read safely." },
        { status: 400 },
      );
    }

    const snapshot = await getCatalogSnapshot();
    const intent = await extractCustomerIntent(body.message.trim(), snapshot, conversation);
    const recommendation = recommendRoutine(snapshot, intent);
    return Response.json({
      ...recommendation,
      intentSource: intent.source,
      agentRun: buildShoppingAgentRun(randomUUID(), snapshot, intent, recommendation),
      suggestedReplies: suggestedAgentReplies(recommendation, intent),
      catalogVersion: snapshot.version,
      disclaimer: "Demo skincare guidance only. This is not medical advice.",
    });
  } catch {
    return Response.json(
      { error: "RECOMMENDATION_UNAVAILABLE", message: "Recommendations are temporarily unavailable. You can still browse the catalog." },
      { status: 503 },
    );
  }
}

function parseConversation(value: unknown): ShoppingConversationTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumConversationTurns) return null;

  const turns: ShoppingConversationTurn[] = [];
  let totalCharacters = 0;
  for (const valueTurn of value) {
    if (!valueTurn || typeof valueTurn !== "object") return null;
    const turn = valueTurn as Record<string, unknown>;
    if ((turn.role !== "shopper" && turn.role !== "assistant") || typeof turn.message !== "string") return null;
    const message = turn.message.trim();
    if (!message || message.length > 1_000) return null;
    totalCharacters += message.length;
    if (totalCharacters > maximumConversationCharacters) return null;
    turns.push({ role: turn.role, message });
  }
  return turns;
}
