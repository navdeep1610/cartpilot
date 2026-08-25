import type { CatalogSnapshot } from "@/domain/catalog/types";
import type { OfferCandidate } from "@/domain/offers/select-offer";
import { selectOffer, type CartLineInput } from "@/domain/offers/select-offer";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { cartLines?: unknown; message?: unknown };
    if (!isCart(body.cartLines)) {
      return Response.json(
        { error: "INVALID_CART", message: "The cart must contain valid catalog variants and quantities." },
        { status: 400 },
      );
    }
    const message = typeof body.message === "string" ? body.message.slice(0, 1_000) : "Review my cart";
    const snapshot = await getCatalogSnapshot();
    const intent = extractFallbackIntent(message);
    const decision = selectOffer(snapshot, body.cartLines, intent);
    const selected = decision.candidates.find(
      (candidate) => candidate.candidateId === decision.selectedCandidateId,
    ) ?? decision.candidates[0];
    const baseline = decision.candidates.find(
      (candidate) => candidate.candidateId === decision.baselineCandidateId,
    ) ?? decision.candidates[0];

    return Response.json({
      decisionId: decision.decisionId,
      catalogVersion: decision.catalogVersion,
      selectedCandidateId: decision.selectedCandidateId,
      baselineCandidateId: decision.baselineCandidateId,
      evaluatedCartLines: body.cartLines,
      selected: toCustomerCandidate(snapshot, selected),
      baseline: toCustomerCandidate(snapshot, baseline),
      explanation: decision.customerExplanation,
      customerConfirmationRequired: decision.customerConfirmationRequired,
      orderCreationAuthorized: decision.orderCreationAuthorized,
      intentSource: intent.source,
    });
  } catch {
    return Response.json(
      { error: "OFFER_UNAVAILABLE", message: "No offer could be calculated. Your original cart is unchanged." },
      { status: 503 },
    );
  }
}

function isCart(value: unknown): value is CartLineInput[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 20 &&
    value.every(
      (line) =>
        line &&
        typeof line === "object" &&
        typeof (line as CartLineInput).variantId === "string" &&
        Number.isSafeInteger((line as CartLineInput).quantity) &&
        (line as CartLineInput).quantity >= 1 &&
        (line as CartLineInput).quantity <= 10,
    )
  );
}

function toCustomerCandidate(snapshot: CatalogSnapshot, candidate: OfferCandidate) {
  return {
    candidateId: candidate.candidateId,
    candidateType: candidate.candidateType,
    lines: candidate.profit.lines.map((line) => {
      const product = snapshot.products.get(line.productId);
      const variant = snapshot.variants.get(line.variantId);
      return {
        variantId: line.variantId,
        productId: line.productId,
        productName: product?.productName ?? "Catalog product",
        productType: product?.productType ?? "Product",
        size: variant?.size ?? "",
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        lineDiscountPaise: line.lineDiscountPaise,
        lineFinalPaise: line.lineFinalPaise,
      };
    }),
    grossPaise: candidate.profit.grossItemRevenuePaise,
    savingPaise: candidate.customerSavingPaise,
    totalPaise: candidate.profit.netRevenuePaise,
  };
}
