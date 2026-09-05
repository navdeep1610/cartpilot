export interface PersistedCart {
  version: 1;
  items: Record<string, number>;
}

export function parsePersistedCart(
  serialized: string | null,
  validVariantIds: ReadonlySet<string>,
): Record<string, number> {
  if (!serialized) return {};

  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.items)) return {};

    const cart: Record<string, number> = {};
    for (const [variantId, quantity] of Object.entries(value.items)) {
      if (!validVariantIds.has(variantId) || !Number.isInteger(quantity) || Number(quantity) <= 0) continue;
      cart[variantId] = Math.min(10, Number(quantity));
    }
    return cart;
  } catch {
    return {};
  }
}

export function serializePersistedCart(cart: Readonly<Record<string, number>>): string {
  return JSON.stringify({ version: 1, items: cart } satisfies PersistedCart);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
