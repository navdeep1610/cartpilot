const idempotencyPattern = /^[A-Za-z0-9._:-]{16,160}$/;

export interface MutationRequestGuard {
  idempotencyKey: string;
  requestId: string;
}

export class MutationRequestError extends Error {
  constructor(
    public readonly code: "CROSS_ORIGIN_REQUEST" | "IDEMPOTENCY_KEY_REQUIRED",
    public readonly status: 400 | 403,
    message: string,
  ) {
    super(message);
    this.name = "MutationRequestError";
  }
}

export function guardCustomerMutation(request: Request): MutationRequestGuard {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get("origin");
  if (!origin || origin !== expectedOrigin(request)) {
    throw new MutationRequestError("CROSS_ORIGIN_REQUEST", 403, "This checkout request must come from CartPilot.");
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyPattern.test(idempotencyKey)) {
    throw new MutationRequestError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
      "A valid checkout idempotency key is required.",
    );
  }
  return { idempotencyKey, requestId };
}

function expectedOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto === "http" ? "http" : "https"}://${forwardedHost}`;
  return new URL(request.url).origin;
}
