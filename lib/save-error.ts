// Client-safe helpers so a failed save is always visible and never leaves a
// button stuck on "Speichert …" (review must 3).

export const SAVE_FAILED = "Speichern fehlgeschlagen. Bitte nochmals versuchen.";

export type SaveFailure = { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> };

const FIELD_LABELS: Record<string, string> = {
  ean: "Barcode",
  nameDe: "Name",
  nameOriginal: "Originalname",
  brand: "Marke",
  originCountry: "Herkunftsland",
  categoryId: "Kategorie",
  priceRappen: "Preis",
  vatRate: "MwSt-Satz",
  unitType: "Verkaufseinheit",
  contentAmount: "Inhaltsmenge",
  contentUnit: "Einheit",
  storageType: "Lagerung",
  ingredientsDe: "Zutaten",
  allergens: "Allergene",
  traces: "Spuren",
  allergensConfirmed: "Allergene geprüft",
  notes: "Notiz",
  dataSource: "Quelle",
  nutrition: "Nährwerte",
};

/** The server message first, then one "Feld: Meldung" line per rejected field. */
export function saveErrorLines(failure: SaveFailure): string[] {
  const lines = [failure.message];
  for (const [field, messages] of Object.entries(failure.fieldErrors ?? {})) {
    const first = messages?.[0];
    if (!first || first === failure.message) continue;
    lines.push(`${FIELD_LABELS[field] ?? field}: ${first}`);
  }
  return lines;
}

/** Runs a server action and turns a thrown error (DB down, network) into a normal failure result. */
export async function settle<T extends { ok: boolean }>(action: () => Promise<T>): Promise<T | SaveFailure> {
  try {
    return await action();
  } catch (error) {
    console.error(error);
    return { ok: false, message: SAVE_FAILED };
  }
}
