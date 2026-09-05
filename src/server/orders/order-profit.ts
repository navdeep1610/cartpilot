import type { MerchantOrderLine, MerchantOrderProfit } from "@/domain/orders/merchant-order";

// Use historical candidate economics, never today's catalog costs or the engine's
// preferred candidate. A decision can be shared by different confirmed carts.
export function confirmedOrderProfit(
  storedDecision: unknown,
  candidateId: string | null,
  lines: MerchantOrderLine[],
  amountPaise: number,
): MerchantOrderProfit | null {
  const audit = object(object(storedDecision).auditDecision);
  if (!Array.isArray(audit.candidates) || lines.length === 0) return null;
  const matching = audit.candidates.map(object).filter((candidate) => {
    if (candidateId && candidate.candidate_id !== candidateId) return false;
    if (!Array.isArray(candidate.lines) || candidate.lines.length !== lines.length) return false;
    const candidateLines = candidate.lines.map(object);
    if (new Set(candidateLines.map((line) => line.variant_id)).size !== lines.length) return false;
    return lines.every((line) => candidateLines.some((entry) =>
      entry.variant_id === line.variantId && entry.product_id === line.productId
      && entry.quantity === line.quantity && entry.unit_price_paise === line.unitPricePaise
      && entry.line_discount_paise === line.discountPaise && entry.line_final_paise === line.lineTotalPaise,
    ));
  });
  // Earlier records without a candidate ID must have one unambiguous match.
  if (matching.length !== 1) return null;
  const stored = object(matching[0].profit);
  const fields = {
    grossItemRevenuePaise: "gross_item_revenue_paise",
    discountCostPaise: "discount_cost_paise",
    netRevenuePaise: "net_revenue_paise",
    productCostPaise: "product_cost_paise",
    packagingCostPaise: "packaging_cost_paise",
    fulfilmentCostPaise: "fulfilment_cost_paise",
    expectedReturnCostPaise: "expected_return_cost_paise",
    estimatedPaymentCostPaise: "estimated_payment_cost_paise",
    incentiveCostPaise: "incentive_cost_paise",
    contributionProfitPaise: "contribution_profit_paise",
  } as const;
  const profit = {} as MerchantOrderProfit;
  for (const key of Object.keys(fields) as (keyof MerchantOrderProfit)[]) {
    const value = stored[fields[key]];
    if (!Number.isSafeInteger(value) || (key !== "contributionProfitPaise" && (value as number) < 0)) return null;
    profit[key] = value as number;
  }
  const gross = lines.reduce((sum, line) => sum + line.unitPricePaise * line.quantity, 0);
  const discount = lines.reduce((sum, line) => sum + line.discountPaise, 0);
  const total = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  const costs = profit.productCostPaise + profit.packagingCostPaise + profit.fulfilmentCostPaise
    + profit.expectedReturnCostPaise + profit.estimatedPaymentCostPaise + profit.incentiveCostPaise;
  if (profit.grossItemRevenuePaise !== gross || profit.discountCostPaise !== discount
    || profit.netRevenuePaise !== amountPaise || total !== amountPaise
    || gross - discount !== amountPaise || !Number.isSafeInteger(costs)
    || profit.netRevenuePaise - costs !== profit.contributionProfitPaise) return null;
  return profit;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
