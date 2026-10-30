// The one category tree for both seeders (prisma/seed.ts for dev, seed-categories.ts
// on the shop PC) and for the VAT suggestion in the forms. It lives under electron/src
// because the Electron build only compiles that folder; the Next app and prisma import
// it from here. Plain data, no Node or Electron imports.

export type SuggestedVatRate = 2.6 | 8.1;

/** Same values as Product.kind in prisma/schema.prisma (enum ProductKind). */
export type SuggestedProductKind = "food" | "alcohol" | "non_food" | "cosmetics";

export interface CategorySeed {
  name: string;
  slug: string;
  sortOrder: number;
  /** Suggested MwSt for articles in this category. Children inherit it. Default 2.6. */
  vatRate?: SuggestedVatRate;
  /** Suggested Warenart; decides which Pflichtfelder apply. Children inherit it. Default food. */
  kind?: SuggestedProductKind;
  children?: CategorySeed[];
}

// Asia-Sortiment für einen Laden in Schaffhausen. Alkohol, Non-Food, Kosmetik und
// Geschirr bekommen 8.1 % vorgeschlagen; der Satz selbst hängt am Artikel und wird im
// Formular bestätigt, siehe swiss-food-compliance.
export const categoryTree: CategorySeed[] = [
  {
    name: "Getränke",
    slug: "getraenke",
    sortOrder: 10,
    children: [
      { name: "Softdrinks & Säfte", slug: "softdrinks-saefte", sortOrder: 10 },
      { name: "Tee & Kaffee", slug: "tee-kaffee", sortOrder: 20 },
      { name: "Alkohol", slug: "alkohol", sortOrder: 30, vatRate: 8.1, kind: "alcohol" },
    ],
  },
  {
    name: "Nudeln & Reis",
    slug: "nudeln-reis",
    sortOrder: 20,
    children: [
      { name: "Instantnudeln", slug: "instantnudeln", sortOrder: 10 },
      { name: "Reis", slug: "reis", sortOrder: 20 },
      { name: "Frische Nudeln & Teigwaren", slug: "frische-nudeln-teigwaren", sortOrder: 30 },
    ],
  },
  {
    name: "Saucen & Würzen",
    slug: "saucen-wuerzen",
    sortOrder: 30,
    children: [
      { name: "Sojasauce & Würzsaucen", slug: "sojasauce-wuerzsaucen", sortOrder: 10 },
      { name: "Currypasten", slug: "currypasten", sortOrder: 20 },
      { name: "Gewürze & Pulver", slug: "gewuerze-pulver", sortOrder: 30 },
      { name: "Öle & Essig", slug: "oele-essig", sortOrder: 40 },
    ],
  },
  {
    name: "Tiefkühlkost",
    slug: "tiefkuehlkost",
    sortOrder: 40,
    children: [
      { name: "TK-Gemüse", slug: "tk-gemuese", sortOrder: 10 },
      { name: "TK-Teigtaschen & Dumplings", slug: "tk-teigtaschen-dumplings", sortOrder: 20 },
      { name: "TK-Fisch & Meeresfrüchte", slug: "tk-fisch-meeresfruechte", sortOrder: 30 },
    ],
  },
  { name: "Konserven", slug: "konserven", sortOrder: 50 },
  { name: "Snacks & Süsswaren", slug: "snacks-suesswaren", sortOrder: 60 },
  {
    name: "Frisch & Gekühlt",
    slug: "frisch-gekuehlt",
    sortOrder: 70,
    children: [
      { name: "Tofu & Sojaprodukte", slug: "tofu-sojaprodukte", sortOrder: 10 },
      { name: "Kimchi & Fermentiertes", slug: "kimchi-fermentiertes", sortOrder: 20 },
      { name: "Frisches Gemüse & Kräuter", slug: "frisches-gemuese-kraeuter", sortOrder: 30 },
    ],
  },
  {
    name: "Non-Food",
    slug: "non-food",
    sortOrder: 80,
    vatRate: 8.1,
    kind: "non_food",
    children: [
      { name: "Küchenutensilien", slug: "kuechenutensilien", sortOrder: 10 },
      { name: "Geschirr & Tischkultur", slug: "geschirr-tischkultur", sortOrder: 20 },
      { name: "Kosmetik & Körperpflege", slug: "kosmetik-koerperpflege", sortOrder: 30, kind: "cosmetics" },
      { name: "Haushalt", slug: "haushalt", sortOrder: 40 },
    ],
  },
];

function collectVatRates(nodes: CategorySeed[], inherited: SuggestedVatRate | undefined, into: Map<string, SuggestedVatRate>) {
  for (const node of nodes) {
    const rate = node.vatRate ?? inherited;
    if (rate !== undefined) into.set(node.slug, rate);
    collectVatRates(node.children ?? [], rate, into);
  }
  return into;
}

/** slug -> suggested rate, with inheritance already applied. Slugs not in here get 2.6. */
export const VAT_RATE_BY_SLUG: ReadonlyMap<string, SuggestedVatRate> = collectVatRates(categoryTree, undefined, new Map());

function collectKinds(nodes: CategorySeed[], inherited: SuggestedProductKind | undefined, into: Map<string, SuggestedProductKind>) {
  for (const node of nodes) {
    const kind = node.kind ?? inherited;
    if (kind !== undefined) into.set(node.slug, kind);
    collectKinds(node.children ?? [], kind, into);
  }
  return into;
}

/** slug -> suggested kind, with inheritance already applied. Slugs not in here are food. */
export const KIND_BY_SLUG: ReadonlyMap<string, SuggestedProductKind> = collectKinds(categoryTree, undefined, new Map());
