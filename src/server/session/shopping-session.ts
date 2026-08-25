import { randomUUID } from "node:crypto";

const cookieName = "cartpilot_session";

export function getShoppingSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const pair of cookieHeader.split(";")) {
    const [name, ...valueParts] = pair.trim().split("=");
    if (name !== cookieName) continue;
    const value = decodeURIComponent(valueParts.join("="));
    if (/^SES-[A-F0-9-]{36}$/.test(value)) return value;
  }
  return null;
}

export function createShoppingSessionId(): string {
  return `SES-${randomUUID().toUpperCase()}`;
}

export function shoppingSessionCookie(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${secure}`;
}
