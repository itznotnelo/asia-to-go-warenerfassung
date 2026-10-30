import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toProductSummary } from "@/lib/product-summary";
import { isGracePeriodOver, shopDeleteDueAt } from "@/lib/archive-grace";
import { getCategories } from "@/app/scan/actions";
import { ProductEditForm } from "./product-edit-form";
import { ProductImages } from "./product-images";
import { ImageUpload } from "./image-upload";
import { ArchivedPanel, DeleteSection } from "./archive-actions";

// Grace-period state depends on "now" - never cache this page.
export const dynamic = "force-dynamic";

function formatDateTime(date: Date): string {
  return date.toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, images] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    getCategories(),
    prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } }),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{product.nameDe}</h1>
        <span className="rounded-md bg-secondary px-3 py-1 text-xs text-muted-foreground">
          {product.archivedAt ? "gelöscht" : product.dataComplete ? "vollständig" : "unvollständig"}
        </span>
      </div>

      {product.archivedAt && (
        <ArchivedPanel
          id={product.id}
          nameDe={product.nameDe}
          sku={product.sku}
          archivedAtLabel={formatDateTime(product.archivedAt)}
          shopDeleteDueLabel={formatDateTime(shopDeleteDueAt(product.archivedAt))}
          gracePeriodOver={isGracePeriodOver(product.archivedAt, new Date())}
        />
      )}

      <ProductImages images={images} />
      <ImageUpload productId={product.id} />

      <ProductEditForm product={toProductSummary(product)} kind={product.kind} categories={categories} />

      {!product.archivedAt && <DeleteSection id={product.id} nameDe={product.nameDe} sku={product.sku} />}
    </div>
  );
}
