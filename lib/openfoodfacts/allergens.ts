/**
 * OFF liefert Allergene als sprachpräfixierte Taxonomie-Tags (`en:milk`,
 * `en:sesame-seeds`, vereinzelt `de:milch`). Kanonische Liste der 14
 * CH/EU-Hauptallergene siehe .claude/skills/swiss-food-compliance/SKILL.md.
 */
const TAG_TO_ALLERGEN: Record<string, string> = {
  gluten: "gluten",
  crustaceans: "crustaceans",
  eggs: "eggs",
  fish: "fish",
  peanuts: "peanuts",
  soybeans: "soybeans",
  soja: "soybeans",
  milk: "milk",
  milch: "milk",
  nuts: "nuts",
  "tree-nuts": "nuts",
  celery: "celery",
  mustard: "mustard",
  sesame: "sesame",
  "sesame-seeds": "sesame",
  sulphites: "sulphites",
  "sulphur-dioxide-and-sulphites": "sulphites",
  lupin: "lupin",
  molluscs: "molluscs",
};

/** Sprachpräfix abschneiden ("en:sesame-seeds" → "sesame-seeds"). */
function stripLangPrefix(tag: string): string {
  const colonIndex = tag.indexOf(":");
  return colonIndex === -1 ? tag : tag.slice(colonIndex + 1);
}

/**
 * Mappt rohe OFF-Tags auf unsere 14 Allergen-Keys. Unbekannte Tags werden
 * verworfen statt geraten — die Liste ist ein Vorschlag, kein Ersatz für die
 * Prüfung durch den Nutzer.
 */
export function mapAllergenTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const mapped = tags
    .map((tag) => TAG_TO_ALLERGEN[stripLangPrefix(tag).toLowerCase()])
    .filter((value): value is string => value !== undefined);
  return [...new Set(mapped)];
}
