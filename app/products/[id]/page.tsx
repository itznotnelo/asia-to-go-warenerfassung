import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toProductSummary } from "@/lib/product-summary";
import { isGracePeriodOver, shopDeleteDueAt } from "@/lib/archive-grace";
import { getCategories } from "@/app/scan/actions";
import { ProductEditForm } from "./product-edit-form";
import { ProductImages } from "./product-images";
import { ImageUpload } from "./image-upload";
import { ArchivedPanel, DeleteSection } from "./archive-actions";
import { ShopReadinessBox } from "@/components/shop-readiness-box";
import { missingForShop } from "@/lib/shop-readiness";

// Grace-period state depends on "now" - never cache this page.
export const dynamic = "force-dynamic";

function formatDateTime(date: Date): string {
  return date.toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, images, nextIncomplete] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    getCategories(),
    prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } }),
    // The work queue in the same order as /dashboard, without this article.
    prisma.product.findFirst({
      where: { archivedAt: null, dataComplete: false, id: { not: id } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, nameDe: true },
    }),
  ]);

  if (!product) notFound();

  const summary = toProductSummary(product);
  const missing = missingForShop({ ...summary, kind: product.kind }, images.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-xl font-semibold">{product.nameDe}</h1>

      <ShopReadinessBox
        missing={missing}
        isAvailable={product.isAvailable}
        archived={product.archivedAt !== null}
        nextIncomplete={nextIncomplete}
      />

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

      <ProductEditForm product={summary} kind={product.kind} categories={categories} />

      {!product.archivedAt && <DeleteSection id={product.id} nameDe={product.nameDe} sku={product.sku} />}
    </div>
  );
}
