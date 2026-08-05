/** Zulässige GTIN-Längen im Handel: EAN-8, UPC-A(12), EAN-13, GTIN-14. */
export const BARCODE_PATTERN = /^\d{8}$|^\d{12,14}$/;

export function hasValidBarcodeFormat(value: string): boolean {
  return BARCODE_PATTERN.test(value);
}

/**
 * GS1-Prüfziffer, von rechts gezählt: die Ziffer direkt links der Prüfziffer
 * wird mit 3 gewichtet, die davor mit 1, alternierend weiter nach links.
 * Dieselbe Formel gilt unverändert für EAN-8, UPC-A, EAN-13 und GTIN-14 —
 * nur die Länge unterscheidet sich, nicht der Algorithmus.
 */
export function hasValidCheckDigit(value: string): boolean {
  if (!hasValidBarcodeFormat(value)) return false;

  const digits = value.slice(0, -1).split("").map(Number).reverse();
  const checkDigit = Number(value.at(-1));
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 3 : 1), 0);
  const computedCheckDigit = (10 - (sum % 10)) % 10;

  return computedCheckDigit === checkDigit;
}

export function isValidBarcode(value: string): boolean {
  return hasValidBarcodeFormat(value) && hasValidCheckDigit(value);
}
