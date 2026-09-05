export interface PurchasedCartLine {
  variantId: string;
  quantity: number;
}

export function removePurchasedLinesFromCart(
  cart: Readonly<Record<string, number>>,
  purchasedLines: readonly PurchasedCartLine[],
): Record<string, number> {
  const next = { ...cart };
  for (const line of purchasedLines) {
    const remaining = (next[line.variantId] ?? 0) - line.quantity;
    if (remaining > 0) next[line.variantId] = remaining;
    else delete next[line.variantId];
  }
  return next;
}
