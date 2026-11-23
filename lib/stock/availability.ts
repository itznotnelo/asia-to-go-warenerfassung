/** Default webshop safety buffer: the last piece on the shelf is not sold online. */
export const DEFAULT_SHOP_SAFETY_BUFFER = 1;

/**
 * Webshop availability rule (v0.3). Without stock tracking (stockQty null) the
 * manual "Verfügbar" flag decides, as before. With tracking, stock decides:
 * available only while stock is above the safety buffer, so the shop never
 * sells the last pieces that may already be in a customer's basket in the store.
 */
export function derivedAvailability(stockQty: number | null, manualFlag: boolean, safetyBuffer: number): boolean {
  if (stockQty === null) return manualFlag;
  return stockQty > safetyBuffer;
}

/** Safety buffer as typed in Einstellungen: whole number 0..9999, else null. */
export function parseSafetyBuffer(input: string): number | null {
  const raw = input.trim();
  if (!/^\d{1,4}$/.test(raw)) return null;
  return Number(raw);
}
