export function merchantEmailMatches(
  email: string | null | undefined,
  configuredEmail: string | null | undefined,
): boolean {
  const actual = email?.trim().toLowerCase();
  const expected = configuredEmail?.trim().toLowerCase();
  return Boolean(actual && expected && actual === expected);
}

export function safeMerchantDestination(value: string | null | undefined): string {
  const destination = value?.trim();
  if (
    !destination ||
    !destination.startsWith("/merchant") ||
    destination.startsWith("//") ||
    destination.startsWith("/merchant/login")
  ) {
    return "/merchant";
  }
  return destination;
}
