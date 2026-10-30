export type CategoryOption = {
  id: string;
  name: string;
  parentName: string | null;
  /** Stable key for the VAT suggestion; the display name may be renamed. */
  slug: string;
  parentSlug: string | null;
};
