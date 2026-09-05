import { beforeAll, describe, expect, it } from "vitest";
import type { CatalogSnapshot } from "@/domain/catalog/types";
import { loadCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { selectOffer } from "@/domain/offers/select-offer";
import { calculateProfit, type ProfitBreakdown } from "@/domain/profit/calculate-profit";
import { toOfferDecisionSchema } from "@/server/offers/validate-offer-decision";
import type { StoredPaymentRecord } from "@/server/database/supabase-admin";
import { toMerchantOrder, type StoredAuditEvent } from "@/server/orders/merchant-order-mapper";

let snapshot: CatalogSnapshot;
beforeAll(async () => { snapshot = await loadCatalogSnapshot(); });

describe("confirmed order profit", () => {
  it("uses the customer's ₹349 baseline instead of the recommended cross-sell", () => {
    const intent = extractFallbackIntent("I want an acne spot treatment");
    const decision = selectOffer(snapshot, [{ variantId: "ACN-001-15G", quantity: 1 }], intent);
    const baseline = decision.candidates.find((candidate) => candidate.candidateId === decision.baselineCandidateId)!;
    expect(decision.selectedCandidateId).not.toBe(baseline.candidateId);
    const stored = {
      // Another customer can confirm a different candidate from this same decision.
      customerConfirmedCandidateId: decision.selectedCandidateId,
      auditDecision: toOfferDecisionSchema(snapshot, decision, intent, "SESSION-PROFIT-TEST"),
    };
    const record = recordWithProfit(baseline.profit, baseline.candidateId);
    const order = toMerchantOrder(record, [], snapshot, stored);
    expect(order.amountPaise).toBe(34900);
    expect(order.profitBreakdown).toMatchObject({
      netRevenuePaise: 34900, productCostPaise: 12500, packagingCostPaise: 1400,
      fulfilmentCostPaise: 3000, expectedReturnCostPaise: 560,
      estimatedPaymentCostPaise: 698, contributionProfitPaise: 16742,
    });
    const recommended = decision.candidates.find((candidate) => candidate.candidateId === decision.selectedCandidateId)!;
    expect(toMerchantOrder(recordWithProfit(recommended.profit, recommended.candidateId), [], snapshot, stored)
      .profitBreakdown?.contributionProfitPaise).toBe(recommended.profit.contributionProfitPaise);
  });

  it("preserves saved costs, quantities, discounts and incentives", () => {
    const profit = calculateProfit(snapshot, [{ variantId: "ACN-001-15G", quantity: 2, lineDiscountPaise: 2000 }], 500);
    const order = toMerchantOrder(recordWithProfit(profit), [], undefined, storedProfit(profit));
    expect(order.profitBreakdown).toMatchObject({
      grossItemRevenuePaise: 69800, discountCostPaise: 2000, netRevenuePaise: 67800,
      productCostPaise: 25000, packagingCostPaise: 2800, fulfilmentCostPaise: 6000,
      expectedReturnCostPaise: 1120, estimatedPaymentCostPaise: 1356,
      incentiveCostPaise: 500, contributionProfitPaise: 31024,
    });
  });

  it("preserves a negative profit and identifies unpaid orders separately", () => {
    const profit = calculateProfit(snapshot, [{ variantId: "ACN-001-15G", quantity: 1, lineDiscountPaise: 30000 }]);
    const order = toMerchantOrder(recordWithProfit(profit), [], snapshot, storedProfit(profit));
    expect(order.profitBreakdown?.contributionProfitPaise).toBe(-12658);
    expect(order.paymentStatus).toBe("awaiting_payment");
  });

  it("matches earlier orders without a candidate ID by exact lines and total", () => {
    const profit = calculateProfit(snapshot, [{ variantId: "ACN-001-15G", quantity: 1 }]);
    const record = recordWithProfit(profit);
    record.confirmed_cart = { lines: profit.lines };
    expect(toMerchantOrder(record, [], snapshot, storedProfit(profit)).profitBreakdown?.contributionProfitPaise).toBe(16742);
  });

  it("does not invent profit for missing, inconsistent or mismatched evidence", () => {
    const profit = calculateProfit(snapshot, [{ variantId: "ACN-001-15G", quantity: 1 }]);
    const record = recordWithProfit(profit);
    expect(toMerchantOrder(record, [], snapshot).profitBreakdown).toBeNull();
    expect(toMerchantOrder({ ...record, amount_paise: 99900 }, [], snapshot, storedProfit(profit)).profitBreakdown).toBeNull();
    expect(toMerchantOrder(recordWithProfit(profit, "different-cart"), [], snapshot, storedProfit(profit)).profitBreakdown).toBeNull();
    const inconsistent = storedProfit({ ...profit, contributionProfitPaise: 42019 });
    expect(toMerchantOrder(record, [], snapshot, inconsistent).profitBreakdown).toBeNull();
    const missing = storedProfit(profit);
    delete (missing.auditDecision.candidates[0].profit as Record<string, unknown>).product_cost_paise;
    expect(toMerchantOrder(record, [], snapshot, missing).profitBreakdown).toBeNull();
  });
});

function recordWithProfit(profit: ProfitBreakdown, candidateId = "confirmed-cart") {
  return paymentRecord({ amount_paise: profit.netRevenuePaise, confirmed_cart: {
    lines: profit.lines, offer: { candidateId },
  } });
}

function storedProfit(profit: ProfitBreakdown) {
  return { auditDecision: { candidates: [{
    candidate_id: "confirmed-cart",
    lines: profit.lines.map((line) => ({
      variant_id: line.variantId, product_id: line.productId, quantity: line.quantity,
      unit_price_paise: line.unitPricePaise, line_discount_paise: line.lineDiscountPaise,
      line_final_paise: line.lineFinalPaise,
    })),
    profit: {
      gross_item_revenue_paise: profit.grossItemRevenuePaise, discount_cost_paise: profit.discountCostPaise,
      net_revenue_paise: profit.netRevenuePaise, product_cost_paise: profit.productCostPaise,
      packaging_cost_paise: profit.packagingCostPaise, fulfilment_cost_paise: profit.fulfilmentCostPaise,
      expected_return_cost_paise: profit.expectedReturnCostPaise, estimated_payment_cost_paise: profit.estimatedPaymentCostPaise,
      incentive_cost_paise: profit.incentiveCostPaise, contribution_profit_paise: profit.contributionProfitPaise,
    },
  }] } };
}

describe("toMerchantOrder", () => {
  it("maps a captured Supabase payment record into a fulfilment-ready order", () => {
    const record = paymentRecord({
      state: "payment_captured",
      callback_verified: true,
      capture_confirmed: true,
      fulfilment_authorized: true,
      razorpay_payment_id: "pay_test_123",
      confirmed_cart: {
        lines: [{
          variantId: "CLN-002-100ML",
          productId: "CLN-002",
          productName: "Salicylic Acid Cleanser",
          productType: "Cleanser",
          size: "100 ml",
          quantity: 1,
          unitPricePaise: 39900,
          lineDiscountPaise: 0,
          lineFinalPaise: 39900,
        }],
        grossPaise: 39900,
        savingPaise: 0,
        customer: {
          name: "Demo Shopper",
          email: "shopper@example.com",
          phone: "+91 98765 43210",
          deliveryAddress: "21 Demo Street, New Delhi",
        },
        offer: { candidateType: "cross_sell", acceptedEngineOffer: true },
      },
    });
    const audit: StoredAuditEvent = {
      audit_event_id: "AUD-TEST-12345678",
      trace_id: record.trace_id,
      event_type: "payment.webhook_applied",
      outcome: "success",
      reason_code: "CAPTURE_AND_ORDER_RECONCILED",
      created_at: "2026-08-25T09:05:00.000Z",
      sequence_number: null,
      schema_version: null,
      idempotency_key: null,
      previous_event_hash: null,
      payload_hash: null,
      event_hash: null,
      canonical_payload: null,
      event_payload: null,
    };

    const order = toMerchantOrder(record, [audit]);

    expect(order.paymentStatus).toBe("paid");
    expect(order.fulfilmentStatus).toBe("ready_to_pack");
    expect(order.customer?.name).toBe("Demo Shopper");
    expect(order.lines[0]?.productName).toBe("Salicylic Acid Cleanser");
    expect(order.auditEvents).toHaveLength(1);
  });

  it("handles an earlier test order without customer or offer snapshots", () => {
    const record = paymentRecord({
      state: "order_created",
      confirmed_cart: {
        lines: [{
          variantId: "SRM-001-15ML",
          productId: "SRM-001",
          quantity: 1,
          unitPricePaise: 49900,
          lineDiscountPaise: 0,
          lineFinalPaise: 49900,
        }],
      },
    });

    const order = toMerchantOrder(record, []);

    expect(order.paymentStatus).toBe("awaiting_payment");
    expect(order.customer).toBeNull();
    expect(order.acceptedEngineOffer).toBeNull();
    expect(order.lines[0]?.productName).toBe("SRM-001");
  });

  it("labels the one-hour application timeout clearly", () => {
    const record = paymentRecord({
      state: "payment_failed",
      failure_code: "PAYMENT_TIMEOUT_1H",
    });

    const order = toMerchantOrder(record, []);

    expect(order.paymentStatus).toBe("failed");
    expect(order.paymentStatusLabel).toBe("Payment timed out");
    expect(order.fulfilmentStatus).toBe("blocked");
  });

  it("exposes safe payment retries as merchant evidence", () => {
    const order = toMerchantOrder(paymentRecord({ payment_retry_count: 2 }), []);

    expect(order.paymentRetryCount).toBe(2);
  });
});

function paymentRecord(overrides: Partial<StoredPaymentRecord>): StoredPaymentRecord {
  return {
    payment_record_id: "PAYREC-TEST-12345678",
    trace_id: "TRACE-TEST-12345678",
    internal_order_id: "ORD-TEST-12345678",
    decision_id: "DECISION-TEST",
    session_id: "SESSION-TEST-12345678",
    cart_hash: "a".repeat(64),
    confirmed_cart: {},
    amount_paise: 39900,
    currency: "INR",
    mode: "test",
    state: "order_created",
    razorpay_order_id: "order_test_123",
    razorpay_order_status: "created",
    razorpay_payment_id: null,
    order_receipt: "ORD-TEST-12345678",
    callback_verified: false,
    capture_confirmed: false,
    capture_confirmation_source: null,
    fulfilment_authorized: false,
    failure_code: null,
    order_creation_claimed_at: "2026-08-25T09:00:00.000Z",
    confirmation_idempotency_key: "confirm:test-12345678",
    order_creation_idempotency_key: "order:test-12345678",
    callback_idempotency_key: null,
    state_version: 3,
    manual_review_required: false,
    last_retry_idempotency_key: null,
    payment_retry_count: 0,
    customer_confirmed_at: "2026-08-25T09:00:00.000Z",
    created_at: "2026-08-25T09:00:00.000Z",
    updated_at: "2026-08-25T09:05:00.000Z",
    ...overrides,
  };
}
