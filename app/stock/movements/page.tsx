import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listMovements } from "@/lib/stock/queries";
import { MOVEMENT_TYPES, movementTypeLabel } from "@/lib/stock/movement-rules";
import { movementFilterSchema } from "@/lib/stock/schemas";
import { inputClass } from "@/lib/input-class";
import { MovementTable } from "@/components/stock/movement-table";

import { PageHeader, listCardClass, pageClass } from "@/components/page";
import { buttonVariants } from "@/components/ui/button-variants";

export const dynamic = "force-dynamic";

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ type?: string; product?: string }> }) {
  const { type, product } = await searchParams;
  const filter = movementFilterSchema.safeParse({ type: type || null });
  const productId = typeof product === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(product) ? product : undefined;
  const [movements, productRow] = await Promise.all([
    listMovements({ type: filter.success ? filter.data.type : null, productId }, 200),
    productId ? prisma.product.findUnique({ where: { id: productId }, select: { id: true, nameDe: true } }) : null,
  ]);

  return (
    <main className={pageClass() + " gap-6"}>
      <PageHeader
        title={`Buchungen${productRow ? `: ${productRow.nameDe}` : ""}`}
        description="Jede Bestandsänderung, neueste zuerst. Korrigiert wird mit einer Gegenbuchung, nie durch Löschen."
        actions={
          productRow && (
            <Link href="/stock/movements" className={buttonVariants({ variant: "outline" })}>
              Alle Artikel zeigen
            </Link>
          )
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        {productRow && <input type="hidden" name="product" value={productRow.id} />}
        <label className="flex min-w-56 flex-col gap-1.5 text-sm text-muted-foreground">
          Art
          <select name="type" defaultValue={filter.success ? (filter.data.type ?? "") : ""} className={inputClass()}>
            <option value="">Alle</option>
            {MOVEMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {movementTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          Filtern
        </button>
      </form>
      <div className={listCardClass}>
        <MovementTable movements={movements} showProduct={!productRow} />
      </div>
      {movements.length === 200 && <p className="text-sm text-muted-foreground">Die neusten 200.</p>}
    </main>
  );
}
