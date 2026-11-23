import Link from "next/link";
import { getCategories } from "@/app/scan/actions";
import { prisma } from "@/lib/prisma";
import { toProductSummary } from "@/lib/product-summary";
import { buildProductWhere, type ProductListFilters } from "./query";
import { ProductsFilterBar } from "./filter-bar";
import { ProductsTable } from "./products-table";
import { UndoDeleteBanner } from "./undo-delete-banner";

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {filters.archived === "true" ? "Gelöschte Artikel" : "Artikel"}{" "}
          <span className="font-numeric text-muted-foreground">({total})</span>
        </h1>
        <Link href="/scan" className="text-sm text-primary hover:underline">
          Neu erfassen
        </Link>
      </div>

      {justDeleted && <UndoDeleteBanner key={justDeleted.id} id={justDeleted.id} nameDe={justDeleted.nameDe} />}

      <ProductsFilterBar categories={categories} filters={filters} />
      <ProductsTable products={products.map(toProductSummary)} categories={categories} />

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          {page > 1 && <PageLink params={params} page={page - 1}>← Vorherige</PageLink>}
          <span className="font-numeric">
            Seite {page} / {totalPages}
          </span>
          {page < totalPages && <PageLink params={params} page={page + 1}>Nächste →</PageLink>}
        </nav>
      )}
    </div>
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
    <Link href={`/products?${query.toString()}`} className="hover:text-foreground hover:underline">
      {children}
    </Link>
  );
}
