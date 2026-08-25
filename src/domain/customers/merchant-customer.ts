export interface MerchantCustomer {
  customerProfileId: string;
  name: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  registeredAt: string;
  updatedAt: string;
  orderCount: number;
  capturedOrderCount: number;
  capturedRevenuePaise: number;
  lastOrderAt: string | null;
}

export interface MerchantCustomersResponse {
  customers: MerchantCustomer[];
  generatedAt: string;
  storage: "supabase";
  testMode: true;
}
