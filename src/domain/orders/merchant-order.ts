export type MerchantPaymentStatus = "paid" | "verifying" | "awaiting_payment" | "failed" | "cancelled";

export type MerchantFulfilmentStatus = "ready_to_pack" | "blocked";

export interface MerchantOrderCustomer {
  name: string;
  email: string;
  phone: string;
  deliveryAddress: string;
}

export interface MerchantOrderLine {
  variantId: string;
  productId: string;
  productName: string;
  productType: string;
  size: string;
  quantity: number;
  unitPricePaise: number;
  discountPaise: number;
  lineTotalPaise: number;
}

export interface MerchantOrderAuditEvent {
  id: string;
  sequence: number | null;
  eventType: string;
  outcome: string;
  reasonCode: string;
  createdAt: string;
  eventHash: string | null;
  previousEventHash: string | null;
}

export interface MerchantAuditIntegrity {
  status: "verified" | "broken" | "legacy";
  eventCount: number;
  headHash: string | null;
  issues: string[];
}

export interface MerchantDecisionEvidence {
  catalogVersion: string | null;
  policyVersion: string | null;
  evaluatedCandidates: number;
  eligibleCandidates: number;
  rejectedCandidates: number;
  selectedCandidateId: string | null;
  baselineCandidateId: string | null;
  selectedContributionProfitPaise: number | null;
  incrementalContributionProfitPaise: number | null;
  rejectionReasonCodes: string[];
}

export interface MerchantOrder {
  paymentRecordId: string;
  traceId: string;
  internalOrderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: "INR";
  mode: "test";
  paymentState: string;
  paymentStatus: MerchantPaymentStatus;
  paymentStatusLabel: string;
  fulfilmentStatus: MerchantFulfilmentStatus;
  fulfilmentStatusLabel: string;
  callbackVerified: boolean;
  captureConfirmed: boolean;
  customer: MerchantOrderCustomer | null;
  lines: MerchantOrderLine[];
  grossPaise: number;
  savingPaise: number;
  offerType: string | null;
  acceptedEngineOffer: boolean | null;
  failureCode: string | null;
  customerConfirmedAt: string;
  createdAt: string;
  updatedAt: string;
  auditEvents: MerchantOrderAuditEvent[];
  auditIntegrity: MerchantAuditIntegrity;
  decisionEvidence: MerchantDecisionEvidence | null;
}

export interface MerchantOrdersResponse {
  orders: MerchantOrder[];
  generatedAt: string;
  storage: "supabase";
  testMode: true;
}
