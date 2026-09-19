/**
 * Peso formatting. Prices come out of Drizzle's `numeric` columns as strings and are
 * kept that way until the moment they are displayed, so nothing is ever rounded by a
 * float along the way.
 */

/** "450.00" -> "₱450";  "1250.50" -> "₱1,250.50" */
export function formatPhp(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '₱—';
  const hasCentavos = Math.round(amount * 100) % 100 !== 0;
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: hasCentavos ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
