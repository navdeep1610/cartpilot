export interface ShoppingConversationTurn {
  role: "shopper" | "assistant";
  message: string;
}

export const maximumConversationTurns = 10;
export const maximumConversationCharacters = 4_000;

export function buildShopperIntentMessage(
  conversation: readonly ShoppingConversationTurn[],
  latestMessage: string,
  maximumLength = 1_000,
): string {
  const shopperMessages = [
    ...conversation.filter((turn) => turn.role === "shopper").map((turn) => turn.message.trim()),
    latestMessage.trim(),
  ].filter(Boolean);

  const selected: string[] = [];
  let usedCharacters = 0;
  for (const message of shopperMessages.reverse()) {
    const remaining = Math.max(0, maximumLength - usedCharacters - (selected.length > 0 ? 1 : 0));
    if (remaining === 0) break;
    selected.unshift(message.slice(-remaining));
    usedCharacters += Math.min(message.length, remaining) + (selected.length > 1 ? 1 : 0);
  }
  return selected.join("\n");
}

export function formatConversationTranscript(
  conversation: readonly ShoppingConversationTurn[],
  latestMessage: string,
): string {
  const priorTurns = conversation.map(
    (turn) => `${turn.role === "shopper" ? "SHOPPER" : "CARTPILOT"}: ${turn.message.trim()}`,
  );
  return [...priorTurns, `SHOPPER (latest): ${latestMessage.trim()}`].join("\n");
}
