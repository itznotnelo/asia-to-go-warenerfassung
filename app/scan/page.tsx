import { getCategories } from "./actions";
import { ScanWorkspace } from "./scan-workspace";

export default async function ScanPage() {
  const categories = await getCategories();
  return <ScanWorkspace categories={categories} />;
}
