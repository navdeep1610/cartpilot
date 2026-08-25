export function inrToPaise(value: string | number): number {
  const normalized = typeof value === "number" ? value.toString() : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid INR amount: ${normalized}`);
  }

  const [rupees, decimal = ""] = normalized.split(".");
  const paise = Number(rupees) * 100 + Number(decimal.padEnd(2, "0"));
  return assertSafeInteger(paise, "INR amount");
}

export function percentToBps(value: string | number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid percentage: ${value}`);
  }
  return assertSafeInteger(Math.round(numeric * 100), "basis points");
}

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("roundHalfUp expects safe integers and a positive denominator");
  }

  const sign = numerator < 0 ? -1n : 1n;
  const absoluteNumerator = BigInt(Math.abs(numerator));
  const bigDenominator = BigInt(denominator);
  const quotient = absoluteNumerator / bigDenominator;
  const remainder = absoluteNumerator % bigDenominator;
  const rounded = remainder * 2n >= bigDenominator ? quotient + 1n : quotient;
  return assertSafeInteger(Number(rounded * sign), "rounded result");
}

export function ceilRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n || numerator < 0n) {
    throw new Error("ceilRatio expects a non-negative numerator and positive denominator");
  }
  const result = (numerator + denominator - 1n) / denominator;
  return assertSafeInteger(Number(result), "ceiling result");
}

export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new Error("formatInr expects an integer paise amount");
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}

function assertSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} exceeded the safe integer range`);
  }
  return Object.is(value, -0) ? 0 : value;
}
