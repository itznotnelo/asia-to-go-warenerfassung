import { getCategories } from "./actions";
import { ScanWorkspace } from "./scan-workspace";
import { isValidBarcode } from "@/lib/barcode";
import { safeReturnPath } from "@/lib/scanner-pages";

// Kategorien kommen live aus der DB — darf nie zur Build-Zeit eingefroren
// werden (und die Build-Umgebung hat ohnehin keine DB-Verbindung).
export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ ean?: string; back?: string }> }) {
  const [categories, params] = await Promise.all([getCategories(), searchParams]);
  // Sent here from Wareneingang/Verkauf/Inventur for an unknown barcode:
  // capture it, then go back there with the new article.
  const back = safeReturnPath(typeof params.back === "string" ? params.back : null);
  const ean = typeof params.ean === "string" && isValidBarcode(params.ean) ? params.ean : null;
  return <ScanWorkspace categories={categories} returnTo={back && ean ? { href: back, ean } : null} />;
}
