export interface CustomerProfileData {
  name: string;
  email: string;
  phone: string;
  deliveryAddress: string;
}

export interface SavedCustomerProfile extends CustomerProfileData {
  customerProfileId: string;
}

export function normalizeCustomerProfile(value: unknown): CustomerProfileData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const email = typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : "";
  const phone = typeof candidate.phone === "string" ? candidate.phone.trim() : "";
  const deliveryAddress =
    typeof candidate.deliveryAddress === "string" ? candidate.deliveryAddress.trim() : "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (
    name.length < 2 ||
    name.length > 80 ||
    email.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.length > 20 ||
    phoneDigits.length < 8 ||
    phoneDigits.length > 15 ||
    deliveryAddress.length < 8 ||
    deliveryAddress.length > 300
  ) {
    return null;
  }

  return { name, email, phone, deliveryAddress };
}

export function profilesMatch(left: CustomerProfileData, right: CustomerProfileData): boolean {
  return (
    left.name === right.name &&
    left.email === right.email &&
    left.phone === right.phone &&
    left.deliveryAddress === right.deliveryAddress
  );
}
