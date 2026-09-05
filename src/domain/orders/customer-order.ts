export interface CustomerOrderLine {
  variantId: string;
  productId: string;
  productName: string;
  productType: string;
  size: string;
  quantity: number;
  lineTotalPaise: number;
}

export interface CustomerOrder {
  orderId: string;
  amountPaise: number;
  currency: "INR";
  placedAt: string;
  status: "confirmed";
  statusLabel: "Payment captured · Ready to pack";
  testMode: true;
  lines: CustomerOrderLine[];
}

export interface CustomerOrdersResponse {
  orders: CustomerOrder[];
  generatedAt: string;
  storage: "supabase";
  testMode: true;
}
