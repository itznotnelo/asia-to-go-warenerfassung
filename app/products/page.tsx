import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCategories } from "@/app/scan/actions";
import { prisma } from "@/lib/prisma";
import { toProductSummary } from "@/lib/product-summary";
import { buildProductWhere, type ProductListFilters } from "./query";
import { ProductsFilterBar } from "./filter-bar";
import { ProductsTable } from "./products-table";
import { UndoDeleteBanner } from "./undo-delete-banner";
import { PageHeader, pageClass } from "@/components/page";
import { buttonVariants } from "@/components/ui/button-variants";

const PAGE_SIZE = 50;

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const filters: ProductListFilters = {
    q: firstString(params.q),
    categoryId: firstString(params.category),
    storageType: firstString(params.storage),
    dataSource: firstString(params.source),
    complete: firstString(params.complete),
    archived: firstString(params.archived),
  };
  const page = Math.max(1, Number(firstString(params.page)) || 1);
  const where = buildProductWhere(filters);
  const deletedId = firstString(params.deleted);

  const [categories, products, total, justDeleted] = await Promise.all([
    getCategories(),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    // Only an article that is still archived gets the "Rückgängig" toast.
    deletedId
      ? prisma.product.findFirst({ where: { id: deletedId, archivedAt: { not: null } }, select: { id: true, nameDe: true } })
      : null,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className={pageClass("wide") + " gap-6"}>
      <PageHeader
        title={filters.archived === "true" ? "Gelöschte Artikel" : "Artikel"}
        count={total}
        actions={
          <Link href="/scan" className={buttonVariants()}>
            Neu erfassen
          </Link>
        }
      />

      {justDeleted && <UndoDeleteBanner key={justDeleted.id} id={justDeleted.id} nameDe={justDeleted.nameDe} />}

      <ProductsFilterBar categories={categories} filters={filters} />
      <ProductsTable products={products.map(toProductSummary)} categories={categories} />

      {totalPages > 1 && (
        <nav aria-label="Seiten" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          {page > 1 && <PageLink params={params} page={page - 1}><ChevronLeft aria-hidden /> Vorherige</PageLink>}
          <span className="font-numeric px-3">
            Seite {page} / {totalPages}
          </span>
          {page < totalPages && <PageLink params={params} page={page + 1}>Nächste <ChevronRight aria-hidden /></PageLink>}
        </nav>
      )}
    </main>
  );
}

function PageLink({
  params,
  page,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  children: React.ReactNode;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // "deleted" only drives the one-off undo toast, it must not follow the pagination.
    if (key === "page" || key === "deleted" || value === undefined) continue;
    query.set(key, Array.isArray(value) ? value[0] : value);
  }
  query.set("page", String(page));
  return (
    <Link href={`/products?${query.toString()}`} className={buttonVariants({ variant: "outline" })}>
      {children}
    </Link>
  );
}
