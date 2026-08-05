// Kanonische 14 CH/EU-Hauptallergene, siehe .claude/skills/swiss-food-compliance/SKILL.md.
export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Glutenhaltiges Getreide",
  crustaceans: "Krebstiere",
  eggs: "Eier",
  fish: "Fische",
  peanuts: "Erdnüsse",
  soybeans: "Soja",
  milk: "Milch (inkl. Laktose)",
  nuts: "Schalenfrüchte / Nüsse",
  celery: "Sellerie",
  mustard: "Senf",
  sesame: "Sesam",
  sulphites: "Schwefeldioxid und Sulfite",
  lupin: "Lupinen",
  molluscs: "Weichtiere",
};

export const ALLERGEN_KEYS = Object.keys(ALLERGEN_LABELS);
