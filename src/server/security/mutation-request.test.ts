import { describe, expect, it } from "vitest";
import { guardCustomerMutation, MutationRequestError } from "./mutation-request";

describe("guardCustomerMutation", () => {
  it("accepts a same-origin request with a bounded idempotency key", () => {
    const result = guardCustomerMutation(request({ origin: "https://cartpilot.test", key: "checkout:1234567890" }));
    expect(result.idempotencyKey).toBe("checkout:1234567890");
    expect(result.requestId).toBeTruthy();
  });

  it("rejects a cross-origin request", () => {
    expect(() => guardCustomerMutation(request({ origin: "https://attacker.test", key: "checkout:1234567890" })))
      .toThrowError(MutationRequestError);
  });

  it("rejects a missing or short idempotency key", () => {
    expect(() => guardCustomerMutation(request({ origin: "https://cartpilot.test", key: "short" })))
      .toThrowError(/idempotency key/i);
  });
});

function request(input: { origin: string; key: string }): Request {
  return new Request("https://cartpilot.test/api/v1/checkout/confirm", {
    method: "POST",
    headers: { origin: input.origin, "idempotency-key": input.key },
  });
}
