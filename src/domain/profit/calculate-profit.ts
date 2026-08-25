import type { CatalogSnapshot } from "@/domain/catalog/types";
import { roundHalfUp } from "@/domain/money";

export interface PricedCandidateLine {
  variantId: string;
  quantity: number;
  lineDiscountPaise?: number;
}

export interface CandidateLineEconomics {
  variantId: string;
  productId: string;
  quantity: number;
  unitPricePaise: number;
  lineSubtotalPaise: number;
  lineDiscountPaise: number;
  lineFinalPaise: number;
  lineContributionProfitPaise: number;
  minContributionMarginPaise: number;
  meetsVariantFloor: boolean;
}

export interface ProfitBreakdown {
  grossItemRevenuePaise: number;
  discountCostPaise: number;
  netRevenuePaise: number;
  productCostPaise: number;
  packagingCostPaise: number;
  fulfilmentCostPaise: number;
  expectedReturnCostPaise: number;
  estimatedPaymentCostPaise: number;
  incentiveCostPaise: number;
  contributionProfitPaise: number;
  contributionMarginBps: number;
  lines: CandidateLineEconomics[];
}

export function calculateProfit(
  snapshot: CatalogSnapshot,
  inputLines: readonly PricedCandidateLine[],
  incentiveCostPaise = 0,
): ProfitBreakdown {
  if (inputLines.length === 0) throw new Error("A profit candidate must contain at least one line");

  const baseLines = inputLines.map((input) => {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
      throw new Error(`Invalid quantity for ${input.variantId}`);
    }
    const variant = snapshot.variants.get(input.variantId);
    const economics = snapshot.economics.get(input.variantId);
    if (!variant || !economics) throw new Error(`Missing catalog data for ${input.variantId}`);

    const lineSubtotalPaise = variant.pricePaise * input.quantity;
    const lineDiscountPaise = input.lineDiscountPaise ?? 0;
    if (!Number.isSafeInteger(lineDiscountPaise) || lineDiscountPaise < 0 || lineDiscountPaise > lineSubtotalPaise) {
      throw new Error(`Invalid discount for ${input.variantId}`);
    }

    const expectedReturnCostPaise = roundHalfUp(
      input.quantity * economics.expectedReturnRateBps * economics.returnProcessingCostPaise,
      10_000,
    );

    return {
      variant,
      economics,
      quantity: input.quantity,
      lineSubtotalPaise,
      lineDiscountPaise,
      lineFinalPaise: lineSubtotalPaise - lineDiscountPaise,
      expectedReturnCostPaise,
    };
  });

  const grossItemRevenuePaise = sum(baseLines.map((line) => line.lineSubtotalPaise));
  const discountCostPaise = sum(baseLines.map((line) => line.lineDiscountPaise));
  const netRevenuePaise = grossItemRevenuePaise - discountCostPaise;
  if (netRevenuePaise <= 0) throw new Error("Candidate net revenue must be positive");

  const productCostPaise = sum(
    baseLines.map((line) => line.economics.unitCostPaise * line.quantity),
  );
  const packagingCostPaise = sum(
    baseLines.map((line) => line.economics.packagingCostPaise * line.quantity),
  );
  const fulfilmentCostPaise = sum(
    baseLines.map((line) => line.economics.fulfilmentCostPaise * line.quantity),
  );
  const expectedReturnCostPaise = sum(baseLines.map((line) => line.expectedReturnCostPaise));
  const estimatedPaymentCostPaise =
    roundHalfUp(netRevenuePaise * snapshot.profitPolicy.paymentCostRateBps, 10_000) +
    snapshot.profitPolicy.paymentCostFixedPaise;

  const paymentAllocations = allocateProportionally(
    estimatedPaymentCostPaise,
    baseLines.map((line) => line.lineFinalPaise),
  );
  const incentiveAllocations = allocateProportionally(
    incentiveCostPaise,
    baseLines.map((line) => line.lineFinalPaise),
  );

  const lines = baseLines.map((line, index): CandidateLineEconomics => {
    const lineContributionProfitPaise =
      line.lineFinalPaise -
      line.economics.unitCostPaise * line.quantity -
      line.economics.packagingCostPaise * line.quantity -
      line.economics.fulfilmentCostPaise * line.quantity -
      line.expectedReturnCostPaise -
      paymentAllocations[index] -
      incentiveAllocations[index];

    return {
      variantId: line.variant.variantId,
      productId: line.variant.productId,
      quantity: line.quantity,
      unitPricePaise: line.variant.pricePaise,
      lineSubtotalPaise: line.lineSubtotalPaise,
      lineDiscountPaise: line.lineDiscountPaise,
      lineFinalPaise: line.lineFinalPaise,
      lineContributionProfitPaise,
      minContributionMarginPaise: line.economics.minContributionMarginPaise,
      meetsVariantFloor: lineContributionProfitPaise >= line.economics.minContributionMarginPaise,
    };
  });

  const contributionProfitPaise =
    netRevenuePaise -
    productCostPaise -
    packagingCostPaise -
    fulfilmentCostPaise -
    expectedReturnCostPaise -
    estimatedPaymentCostPaise -
    incentiveCostPaise;

  return {
    grossItemRevenuePaise,
    discountCostPaise,
    netRevenuePaise,
    productCostPaise,
    packagingCostPaise,
    fulfilmentCostPaise,
    expectedReturnCostPaise,
    estimatedPaymentCostPaise,
    incentiveCostPaise,
    contributionProfitPaise,
    contributionMarginBps: roundHalfUp(contributionProfitPaise * 10_000, netRevenuePaise),
    lines,
  };
}

function allocateProportionally(total: number, weights: readonly number[]): number[] {
  if (total === 0) return weights.map(() => 0);
  const denominator = sum(weights);
  if (denominator <= 0) throw new Error("Cannot allocate against a zero total");

  const allocations = weights.map((weight) => Math.floor((total * weight) / denominator));
  let remainder = total - sum(allocations);
  const rankedIndices = weights
    .map((weight, index) => ({ weight, index }))
    .sort((left, right) => right.weight - left.weight || left.index - right.index);

  for (let position = 0; remainder > 0; position = (position + 1) % rankedIndices.length) {
    allocations[rankedIndices[position].index] += 1;
    remainder -= 1;
  }
  return allocations;
}

function sum(values: readonly number[]): number {
  const total = values.reduce((accumulator, value) => accumulator + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error("Money calculation exceeded the safe integer range");
  return total;
}
