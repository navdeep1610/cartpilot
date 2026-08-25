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
  eventType: string;
  outcome: string;
  reasonCode: string;
  createdAt: string;
}

export interface MerchantOrder {
  paymentRecordId: string;
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
}

export interface MerchantOrdersResponse {
  orders: MerchantOrder[];
  generatedAt: string;
  storage: "supabase";
  testMode: true;
}
