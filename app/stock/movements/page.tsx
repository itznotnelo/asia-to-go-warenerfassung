import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listMovements } from "@/lib/stock/queries";
import { MOVEMENT_TYPES, movementTypeLabel } from "@/lib/stock/movement-rules";
import { movementFilterSchema } from "@/lib/stock/schemas";
import { inputClass } from "@/lib/input-class";
import { MovementTable } from "@/components/stock/movement-table";

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Buchungen{productRow && `: ${productRow.nameDe}`}</h1>
      {productRow && (
        <Link href="/stock/movements" className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-2">
          Alle Artikel zeigen
        </Link>
      )}
      <form method="get" className="flex flex-wrap items-end gap-3">
        {productRow && <input type="hidden" name="product" value={productRow.id} />}
        <label className="flex flex-col gap-1 text-sm">
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
        <button type="submit" className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-muted">
          Filtern
        </button>
      </form>
      <div className="rounded-lg border border-border bg-card px-4">
        <MovementTable movements={movements} showProduct={!productRow} />
      </div>
      {movements.length === 200 && <p className="text-sm text-muted-foreground">Die neusten 200.</p>}
    </div>
  );
}
