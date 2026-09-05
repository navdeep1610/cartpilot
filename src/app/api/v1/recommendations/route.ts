import { randomUUID } from "node:crypto";
import { buildShoppingAgentRun, suggestedAgentReplies } from "@/domain/agents/shopping-agent-run";
import { recommendRoutine } from "@/domain/recommendations/recommend-routine";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { extractCustomerIntent } from "@/server/intent/extract-customer-intent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown };
    if (typeof body.message !== "string" || body.message.trim().length < 3 || body.message.length > 1_000) {
      return Response.json(
        { error: "INVALID_MESSAGE", message: "Describe your skin type and one concern in a short sentence." },
        { status: 400 },
      );
    }

    const snapshot = await getCatalogSnapshot();
    const intent = await extractCustomerIntent(body.message.trim(), snapshot);
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
