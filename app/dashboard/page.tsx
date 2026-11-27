import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/app/scan/actions";
import { toProductSummary } from "@/lib/product-summary";
import { missingForShop, missingLabels } from "@/lib/shop-readiness";
import { EmptyState, PageHeader, SectionTitle, StatCard, listCardClass, pageClass } from "@/components/page";
import { buttonVariants } from "@/components/ui/button-variants";
import { buildCategoryCounts, computeOffHitRate, countIncomplete, WORK_QUEUE_LIMIT } from "./stats";

// Zeigt live Fortschritt aus der DB — darf nie zur Build-Zeit eingefroren
// werden (und die Build-Umgebung hat ohnehin keine DB-Verbindung).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Soft-deleted articles (review should #34) are not part of the progress.
  const [totalCount, completeCount, scanLogGroups, categoryGroups, categories, incompleteProducts] = await Promise.all([
    prisma.product.count({ where: { archivedAt: null } }),
    prisma.product.count({ where: { archivedAt: null, dataComplete: true } }),
    prisma.scanLog.groupBy({ by: ["result"], _count: { result: true } }),
    prisma.product.groupBy({ by: ["categoryId"], where: { archivedAt: null }, _count: { categoryId: true } }),
    getCategories(),
    prisma.product.findMany({
      where: { archivedAt: null, dataComplete: false },
      orderBy: { updatedAt: "desc" },
      take: WORK_QUEUE_LIMIT,
      include: { _count: { select: { images: true } } },
    }),
  ]);
  // The list is capped, the heading is not: count from the totals, not the list length.
  const incompleteCount = countIncomplete(totalCount, completeCount);

  const scanCounts = { existing_product: 0, off_hit: 0, off_miss: 0 };
  for (const group of scanLogGroups) {
    scanCounts[group.result] = group._count.result;
  }
  const offHitRate = computeOffHitRate(scanCounts);

  const categoryCountMap = new Map(categoryGroups.map((g) => [g.categoryId, g._count.categoryId]));
  const categoryCounts = buildCategoryCounts(categoryCountMap, categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <main className={pageClass()}>
      <PageHeader
        title="Fortschritt"
        description="Wie weit die Erfassung ist und was für den Webshop noch fehlt."
        actions={
          incompleteProducts[0] && (
            <Link href={`/products/${incompleteProducts[0].id}`} className={buttonVariants()}>
              Ersten Artikel ergänzen
            </Link>
          )
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Artikel erfasst" value={String(totalCount)} />
        <StatCard label="Vollständig" value={`${completeCount} / ${totalCount}`} />
        <StatCard
          label="Online gefunden"
          value={offHitRate === null ? "noch keine Scans" : `${Math.round(offHitRate * 100)} %`}
          numeric={offHitRate !== null}
        />
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col gap-3">
          <SectionTitle title={`Noch nicht im Webshop (${incompleteCount})`} />
          {incompleteProducts.length === 0 ? (
            <EmptyState title="Alle Artikel sind vollständig.">Neue Artikel kommen über «Scannen» dazu.</EmptyState>
          ) : (
            <div className={listCardClass}>
              {incompleteProducts.map((product) => {
                const missing = missingLabels(
                  missingForShop({ ...toProductSummary(product), kind: product.kind }, product._count.images > 0),
                );
                return (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="-mx-4 flex min-h-14 flex-col justify-center gap-0.5 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-medium">{product.nameDe}</span>
                      <span className="font-numeric text-xs text-muted-foreground">{product.sku}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {categoryById.get(product.categoryId)?.name ?? "ohne Kategorie"} · Fehlt: <span className="text-foreground">{missing.join(", ")}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          {incompleteCount > incompleteProducts.length && (
            <p className="text-sm text-muted-foreground">
              Die {WORK_QUEUE_LIMIT} zuletzt bearbeiteten. Alle unter{" "}
              <Link href="/products" className="underline underline-offset-4 hover:text-foreground">
                Artikel
              </Link>
              .
            </p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="Artikel pro Kategorie" />
          {categoryCounts.length === 0 ? (
            <EmptyState title="Noch keine Artikel erfasst." />
          ) : (
            <div className={listCardClass}>
              {categoryCounts.map((entry) => (
                <div key={entry.categoryId} className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
                  <span>
                    {entry.parentName && <span className="text-muted-foreground">{entry.parentName} · </span>}
                    {entry.categoryName}
                  </span>
                  <span className="font-numeric">{entry.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
