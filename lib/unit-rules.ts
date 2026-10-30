// No imports on purpose: prisma/seed.ts uses this too, and it runs without the "@/" alias.

/**
 * What unitType means (the webshop reads it the same way):
 * - piece: prepacked, priceRappen is per pack. contentAmount/contentUnit is the
 *   pack content (510 g, 330 ml, 5 Stk) or empty.
 * - weight / volume: sold loose, priceRappen is per contentAmount contentUnit
 *   (usually 1 kg or 1 l, sometimes 100 g). Both are required, weight only in
 *   g/kg, volume only in ml/l, so the Grundpreis can always be computed.
 */
export const UNIT_TYPE_UNITS = {
  weight: ["g", "kg"],
  volume: ["ml", "l"],
} as const;

export interface UnitFields {
  unitType: "piece" | "weight" | "volume";
  contentAmount?: number | null;
  contentUnit?: "g" | "kg" | "ml" | "l" | "stk" | null;
}

export interface UnitRuleIssue {
  path: "contentAmount" | "contentUnit";
  message: string;
}

/** Empty when the combination is valid; otherwise one German message per bad field. */
export function unitRuleIssues(fields: UnitFields): UnitRuleIssue[] {
  const issues: UnitRuleIssue[] = [];
  const hasAmount = fields.contentAmount !== undefined && fields.contentAmount !== null;
  const hasUnit = fields.contentUnit !== undefined && fields.contentUnit !== null;

  if (hasUnit && !hasAmount) issues.push({ path: "contentAmount", message: "Inhaltsmenge fehlt zur Einheit" });
  if (hasAmount && !hasUnit) issues.push({ path: "contentUnit", message: "Einheit fehlt zur Inhaltsmenge" });
  if (fields.unitType === "piece") return issues;

  const allowed: readonly string[] = UNIT_TYPE_UNITS[fields.unitType];
  if (!hasUnit || !allowed.includes(fields.contentUnit as string)) {
    const message = fields.unitType === "weight" ? "Offen nach Gewicht braucht g oder kg" : "Offen nach Volumen braucht ml oder l";
    issues.push({ path: "contentUnit", message });
  }
  return issues;
}
