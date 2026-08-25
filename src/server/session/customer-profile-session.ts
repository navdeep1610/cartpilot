import { randomUUID } from "node:crypto";

const cookieName = "cartpilot_customer";

export function getCustomerProfileId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const pair of cookieHeader.split(";")) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (name !== cookieName) continue;
    const value = decodeURIComponent(valueParts.join("="));
    if (/^CUSTOMER-[A-F0-9-]{36}$/.test(value)) return value;
  }
  return null;
}

export function createCustomerProfileId(): string {
  return `CUSTOMER-${randomUUID().toUpperCase()}`;
}

export function customerProfileCookie(customerProfileId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(customerProfileId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}
