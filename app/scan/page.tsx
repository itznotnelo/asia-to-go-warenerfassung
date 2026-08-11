import { getCategories } from "./actions";
import { ScanWorkspace } from "./scan-workspace";

// Kategorien kommen live aus der DB — darf nie zur Build-Zeit eingefroren
// werden (und die Build-Umgebung hat ohnehin keine DB-Verbindung).
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const categories = await getCategories();
  return <ScanWorkspace categories={categories} />;
}
