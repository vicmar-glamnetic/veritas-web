/**
 * Philippine mobile numbers.
 *
 * Patients type these every way imaginable — 0917 123 4567, +63 917 123 4567,
 * 639171234567. They are stored in one canonical form, +639XXXXXXXXX, so that the
 * booking lookup and the future walk-in dedup can match on equality.
 */

const PH_MOBILE = /^\+639\d{9}$/;

/** Returns the canonical +639XXXXXXXXX form, or null if it is not a PH mobile. */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let rest: string;

  if (digits.startsWith('+63')) rest = digits.slice(3);
  else if (digits.startsWith('63')) rest = digits.slice(2);
  else if (digits.startsWith('0')) rest = digits.slice(1);
  else rest = digits;

  const candidate = `+63${rest}`;
  return PH_MOBILE.test(candidate) ? candidate : null;
}

/** "+639171234567" -> "0917 123 4567", the form Filipinos actually read. */
export function formatMobile(canonical: string): string {
  if (!PH_MOBILE.test(canonical)) return canonical;
  const local = `0${canonical.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
