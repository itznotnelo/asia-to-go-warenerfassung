import { listSuppliers } from "@/lib/stock/suppliers";
import { SupplierManager } from "./supplier-manager";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold">Lieferanten</h1>
        <p className="text-sm text-muted-foreground">Für Wareneingang und Nachbestellen. Der Standard-Lieferant eines Artikels steht auf der Artikelseite unter «Lager».</p>
      </div>
      <SupplierManager suppliers={suppliers} />
    </div>
  );
}
