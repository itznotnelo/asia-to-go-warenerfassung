import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { supplierInputSchema } from "./schemas";
import type { StockResult } from "./run";

export interface SupplierView {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  customerNumber: string | null;
  notes: string | null;
  productCount: number;
}

export async function listSuppliers(): Promise<SupplierView[]> {
  const rows = await prisma.supplier.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    phone: row.phone,
    email: row.email,
    customerNumber: row.customerNumber,
    notes: row.notes,
    productCount: row._count.products,
  }));
}

/** For select boxes: id + name of active suppliers. */
export async function supplierOptions(): Promise<{ id: string; name: string }[]> {
  return prisma.supplier.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Bitte Eingaben prüfen.";
}

export async function saveSupplier(rawInput: unknown): Promise<StockResult<{ id: string }>> {
  const parsed = supplierInputSchema.extend({ id: z.string().min(1).max(64).nullish() }).safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { id, ...data } = parsed.data;
  if (id) {
    const updated = await prisma.supplier.updateMany({ where: { id, archivedAt: null }, data });
    if (updated.count === 0) return { ok: false, message: "Lieferant nicht gefunden." };
    return { ok: true, data: { id } };
  }
  const created = await prisma.supplier.create({ data });
  return { ok: true, data: { id: created.id } };
}

/**
 * Soft delete: movements, lots and receipts keep showing the name. Articles
 * that had it as their default supplier lose the default.
 */
export async function archiveSupplier(id: string): Promise<StockResult> {
  await prisma.$transaction([
    prisma.product.updateMany({ where: { defaultSupplierId: id }, data: { defaultSupplierId: null } }),
    prisma.supplier.updateMany({ where: { id }, data: { archivedAt: new Date() } }),
  ]);
  return { ok: true, data: undefined };
}
