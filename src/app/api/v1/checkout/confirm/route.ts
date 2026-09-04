import type { CartLineInput } from "@/domain/offers/select-offer";
import { normalizeCustomerProfile, profilesMatch } from "@/domain/customers/customer-profile";
import { findConfirmableCandidate, selectOffer } from "@/domain/offers/select-offer";
import { extractFallbackIntent } from "@/domain/intent/fallback-intent";
import { getCatalogSnapshot } from "@/server/catalog/file-catalog-repository";
import { findCustomerProfile, toSavedCustomerProfile } from "@/server/customers/customer-profile-repository";
import {
  DatabaseConfigurationError,
  getSupabaseAdmin,
  type StoredPaymentRecord,
} from "@/server/database/supabase-admin";
import { hashCanonicalJson } from "@/server/security/canonical-json";
import { PAYMENT_TIMEOUT_REASON } from "@/server/payments/payment-timeout";
import {
  createShoppingSessionId,
  getShoppingSessionId,
  shoppingSessionCookie,
} from "@/server/session/shopping-session";
import { getCustomerProfileId } from "@/server/session/customer-profile-session";
import { assertOfferDecisionSchema } from "@/server/offers/validate-offer-decision";

export const runtime = "nodejs";

interface ConfirmationBody {
  evaluatedCartLines?: unknown;
  message?: unknown;
  expectedDecisionId?: unknown;
  expectedCandidateId?: unknown;
  expectedTotalPaise?: unknown;
  customer?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConfirmationBody;
    const submittedCustomer = normalizeCustomerProfile(body.customer);
    if (
      !isCart(body.evaluatedCartLines) ||
      typeof body.expectedDecisionId !== "string" ||
      typeof body.expectedCandidateId !== "string" ||
      !Number.isSafeInteger(body.expectedTotalPaise) ||
      (body.expectedTotalPaise as number) < 100 ||
      !submittedCustomer
    ) {
      return safeError(
        "INVALID_CONFIRMATION",
        "The checkout confirmation or delivery details were incomplete.",
        400,
        false,
      );
    }

    const customerProfileId = getCustomerProfileId(request);
    const storedCustomer = customerProfileId ? await findCustomerProfile(customerProfileId) : null;
    if (!storedCustomer) {
      return safeError(
        "PROFILE_REQUIRED",
        "Save your contact and delivery details in Profile before checkout.",
        409,
        true,
      );
    }
    const customer = toSavedCustomerProfile(storedCustomer);
    if (!profilesMatch(submittedCustomer, customer)) {
      return safeError(
        "PROFILE_CHANGED",
        "Your saved profile changed. Reopen Profile, review the details and try again.",
        409,
        true,
      );
    }

    const message = typeof body.message === "string" ? body.message.slice(0, 1_000) : "Review my cart";
    const snapshot = await getCatalogSnapshot();
    const intent = extractFallbackIntent(message);
    const decision = selectOffer(snapshot, body.evaluatedCartLines, intent);
    let responseSessionId = getShoppingSessionId(request) ?? createShoppingSessionId();
    assertOfferDecisionSchema(snapshot, decision, intent, responseSessionId);
    const confirmedCandidate = findConfirmableCandidate(decision, body.expectedCandidateId);
    if (!confirmedCandidate) {
      return safeError("DECISION_INVALID", "The confirmed cart could not be reconstructed.", 409, true);
    }

    if (
      decision.decisionId !== body.expectedDecisionId ||
      confirmedCandidate.profit.netRevenuePaise !== body.expectedTotalPaise
    ) {
      return Response.json(
        {
          error: "OFFER_CHANGED",
          message: "The catalog or offer changed before confirmation. Please review the updated total.",
          retrySafe: true,
          updatedDecision: {
            decisionId: decision.decisionId,
            candidateId: confirmedCandidate.candidateId,
            totalPaise: confirmedCandidate.profit.netRevenuePaise,
          },
        },
        { status: 409 },
      );
    }

    const confirmedCart = {
      lines: confirmedCandidate.profit.lines.map((line) => ({
        variantId: line.variantId,
        productId: line.productId,
        productName: snapshot.products.get(line.productId)?.productName ?? line.productId,
        productType: snapshot.products.get(line.productId)?.productType ?? "Skincare",
        size: snapshot.variants.get(line.variantId)?.size ?? "",
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        lineDiscountPaise: line.lineDiscountPaise,
        lineFinalPaise: line.lineFinalPaise,
      })),
      grossPaise: confirmedCandidate.profit.grossItemRevenuePaise,
      savingPaise: confirmedCandidate.profit.discountCostPaise,
      totalPaise: confirmedCandidate.profit.netRevenuePaise,
      currency: "INR",
      customer,
      offer: {
        candidateId: confirmedCandidate.candidateId,
        candidateType: confirmedCandidate.candidateType,
        acceptedEngineOffer: confirmedCandidate.candidateId === decision.selectedCandidateId,
        savingPaise: confirmedCandidate.profit.discountCostPaise,
      },
    };
    const cartHash = hashCanonicalJson(confirmedCart);
    const confirmationParams = {
      p_decision_id: decision.decisionId,
      p_catalog_version: decision.catalogVersion,
      p_policy_version: decision.policyVersion,
      p_selected_candidate_id: confirmedCandidate.candidateId,
      p_amount_paise: confirmedCandidate.profit.netRevenuePaise,
      p_cart_hash: cartHash,
      p_confirmed_cart: confirmedCart,
      p_decision_payload: {
        ...decision,
        customerConfirmedCandidateId: confirmedCandidate.candidateId,
        customerAcceptedEngineOffer: confirmedCandidate.candidateId === decision.selectedCandidateId,
      },
    };
    let record = await confirmCheckoutForSession(responseSessionId, confirmationParams);

    // A timed-out checkout is final. Give the customer a fresh session and
    // payment record instead of accidentally returning the expired order.
    if (record?.failure_code === PAYMENT_TIMEOUT_REASON) {
      responseSessionId = createShoppingSessionId();
      record = await confirmCheckoutForSession(responseSessionId, confirmationParams);
    }
    if (!record) throw new Error("Supabase confirmation did not return a payment record");

    return Response.json(
      {
        paymentRecordId: record.payment_record_id,
        decisionId: record.decision_id,
        amountPaise: record.amount_paise,
        currency: record.currency,
        state: record.state,
        customerConfirmed: true,
        orderCreationAuthorized: true,
        fulfilmentAuthorized: false,
      },
      { status: 201, headers: { "Set-Cookie": shoppingSessionCookie(responseSessionId) } },
    );
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return safeError(
        "SUPABASE_SETUP_REQUIRED",
        "Secure checkout storage is not connected yet. No order or payment was started.",
        503,
        true,
      );
    }
    return safeError("CONFIRMATION_FAILED", "The cart could not be confirmed. No order or payment was started.", 503, true);
  }
}

async function confirmCheckoutForSession(
  sessionId: string,
  confirmationParams: Record<string, unknown>,
): Promise<StoredPaymentRecord | undefined> {
  const { data, error } = await getSupabaseAdmin().rpc("confirm_checkout", {
    p_session_id: sessionId,
    ...confirmationParams,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as StoredPaymentRecord | undefined;
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

function safeError(error: string, message: string, status: number, retrySafe: boolean) {
  return Response.json({ error, message, retrySafe }, { status });
}
