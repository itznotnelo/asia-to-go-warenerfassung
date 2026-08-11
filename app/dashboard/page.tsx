import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/app/scan/actions";
import { buildCategoryCounts, computeOffHitRate } from "./stats";

// Zeigt live Fortschritt aus der DB — darf nie zur Build-Zeit eingefroren
// werden (und die Build-Umgebung hat ohnehin keine DB-Verbindung).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totalCount, completeCount, scanLogGroups, categoryGroups, categories, incompleteProducts] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { dataComplete: true } }),
    prisma.scanLog.groupBy({ by: ["result"], _count: { result: true } }),
    prisma.product.groupBy({ by: ["categoryId"], _count: { categoryId: true } }),
    getCategories(),
    prisma.product.findMany({
      where: { dataComplete: false },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  const scanCounts = { existing_product: 0, off_hit: 0, off_miss: 0 };
  for (const group of scanLogGroups) {
    scanCounts[group.result] = group._count.result;
  }
  const offHitRate = computeOffHitRate(scanCounts);

  const categoryCountMap = new Map(categoryGroups.map((g) => [g.categoryId, g._count.categoryId]));
  const categoryCounts = buildCategoryCounts(categoryCountMap, categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <h1 className="text-xl font-semibold">Fortschritt</h1>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Artikel erfasst" value={String(totalCount)} />
        <StatCard label="Vollständig" value={`${completeCount} / ${totalCount}`} />
        <StatCard label="OFF-Trefferquote" value={offHitRate === null ? "—" : `${Math.round(offHitRate * 100)} %`} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Artikel pro Kategorie</h2>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          {categoryCounts.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Artikel erfasst.</p>}
          {categoryCounts.map((entry) => (
            <div key={entry.categoryId} className="flex items-center justify-between border-b border-border py-2 last:border-b-0">
              <span>
                {entry.parentName && <span className="text-muted-foreground">{entry.parentName} · </span>}
                {entry.categoryName}
              </span>
              <span className="font-numeric">{entry.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Arbeitsvorrat — unvollständige Artikel ({incompleteProducts.length})
        </h2>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          {incompleteProducts.length === 0 && <p className="text-sm text-muted-foreground">Alle Artikel sind vollständig.</p>}
          {incompleteProducts.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex items-center justify-between border-b border-border py-2 last:border-b-0 hover:bg-muted/50"
            >
              <span>
                {product.nameDe}
                <span className="font-numeric text-xs text-muted-foreground"> · {product.sku}</span>
              </span>
              <span className="text-xs text-muted-foreground">{categoryById.get(product.categoryId)?.name ?? "—"}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex gap-3 text-sm">
        <a href="/api/export?format=json" className="text-primary hover:underline">
          Export JSON
        </a>
        <a href="/api/export?format=csv" className="text-primary hover:underline">
          Export CSV
        </a>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-numeric text-2xl font-semibold">{value}</p>
    </div>
  );
}
