import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toProductSummary } from "@/lib/product-summary";
import { getCategories } from "@/app/scan/actions";
import { ProductEditForm } from "./product-edit-form";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([prisma.product.findUnique({ where: { id } }), getCategories()]);

  if (!product) notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{product.nameDe}</h1>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
          {product.dataComplete ? "vollständig" : "unvollständig"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Bildverwaltung ist noch nicht angebunden — <code className="font-numeric">dataComplete</code> bleibt deshalb
        false, bis das nachgezogen ist.
      </p>
      <ProductEditForm product={toProductSummary(product)} categories={categories} />
    </div>
  );
}
