import { PageHeader, pageClass } from "@/components/page";
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
import { getProductStockCard } from "@/lib/stock/queries";
import { supplierOptions } from "@/lib/stock/suppliers";
import { StockCard } from "./stock-card";

// Grace-period state depends on "now" - never cache this page.
export const dynamic = "force-dynamic";

function formatDateTime(date: Date): string {
  return date.toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, images, nextIncomplete, stockCard, suppliers] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    getCategories(),
    prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } }),
    // The work queue in the same order as /dashboard, without this article.
    prisma.product.findFirst({
      where: { archivedAt: null, dataComplete: false, id: { not: id } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, nameDe: true },
    }),
    getProductStockCard(id),
    supplierOptions(),
  ]);

  if (!product) notFound();

  const summary = toProductSummary(product);
  const missing = missingForShop({ ...summary, kind: product.kind }, images.length > 0);

  return (
    <main className={pageClass()}>
      <PageHeader
        title={product.nameDe}
        description={
          <span className="font-numeric">
            {product.sku}
            {product.ean && ` · EAN ${product.ean}`}
          </span>
        }
      />

      {/* Two columns at the counter laptop (1366 px): edit on the left, status and stock on the right. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6 lg:order-2">
          <ShopReadinessBox
            missing={missing}
            isAvailable={product.isAvailable}
            archived={product.archivedAt !== null}
            nextIncomplete={nextIncomplete}
            stockTracked={product.stockQty !== null}
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

          {stockCard && <StockCard card={stockCard} suppliers={suppliers} />}

          <ProductImages images={images} />
          <ImageUpload productId={product.id} />
        </div>

        <div className="flex flex-col gap-6 lg:order-1">
          <ProductEditForm product={summary} kind={product.kind} categories={categories} />

          {!product.archivedAt && <DeleteSection id={product.id} nameDe={product.nameDe} sku={product.sku} />}
        </div>
      </div>
    </main>
  );
}
