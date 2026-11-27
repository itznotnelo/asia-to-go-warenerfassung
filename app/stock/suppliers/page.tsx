import { listSuppliers } from "@/lib/stock/suppliers";
import { SupplierManager } from "./supplier-manager";

import { PageHeader, pageClass } from "@/components/page";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <main className={pageClass()}>
      <PageHeader
        title="Lieferanten"
        description="Für Wareneingang und Nachbestellen. Der Standard-Lieferant eines Artikels steht auf der Artikelseite unter «Lager»."
      />
      <SupplierManager suppliers={suppliers} />
    </main>
  );
}
