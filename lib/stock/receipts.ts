import "server-only";
import { prisma } from "@/lib/prisma";
import { bookMovement, StockError, type StockDb } from "./ledger";
import { createReceiptSchema, documentIdSchema, receiptLineIdSchema, receiptLineSchema } from "./schemas";
import { runStockTx, type StockResult } from "./run";
import { packsToQty } from "./units";

// Wareneingang: a receipt is a draft (status open) that collects scanned lines
// and survives leaving the page (e.g. to capture an unknown article on /scan).
// Booking writes all lots and receipt movements in one transaction.

function invalid(): { ok: false; message: string } {
  return { ok: false, message: "Bitte Eingaben prüfen." };
}

export async function createReceipt(rawInput: unknown): Promise<StockResult<{ id: string }>> {
  const parsed = createReceiptSchema.safeParse(rawInput);
  if (!parsed.success) return invalid();
  const receipt = await prisma.goodsReceipt.create({ data: parsed.data });
  return { ok: true, data: { id: receipt.id } };
}

async function requireOpen(db: StockDb, receiptId: string): Promise<void> {
  const receipt = await db.goodsReceipt.findUnique({ where: { id: receiptId }, select: { status: true } });
  if (!receipt) throw new StockError("Lieferung nicht gefunden.");
  if (receipt.status !== "open") throw new StockError("Diese Lieferung ist schon gebucht oder abgebrochen.");
}

export async function addReceiptLine(rawInput: unknown): Promise<StockResult<{ id: string }>> {
  const parsed = receiptLineSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  const { packs, packSize, ...line } = parsed.data;
  const quantity = packsToQty(packs, packSize);
  if (!Number.isSafeInteger(quantity) || quantity > 1_000_000_000) return { ok: false, message: "Menge zu gross." };
  return runStockTx(async (tx) => {
    await requireOpen(tx, line.receiptId);
    const product = await tx.product.findUnique({ where: { id: line.productId }, select: { id: true } });
    if (!product) throw new StockError("Artikel nicht gefunden.");
    const created = await tx.goodsReceiptLine.create({ data: { ...line, packs, packSize, quantity } });
    return { id: created.id };
  });
}

export async function removeReceiptLine(rawInput: unknown): Promise<StockResult> {
  const parsed = receiptLineIdSchema.safeParse(rawInput);
  if (!parsed.success) return invalid();
  return runStockTx(async (tx) => {
    const line = await tx.goodsReceiptLine.findUnique({ where: { id: parsed.data.lineId }, select: { receiptId: true } });
    if (!line) return undefined;
    await requireOpen(tx, line.receiptId);
    await tx.goodsReceiptLine.delete({ where: { id: parsed.data.lineId } });
    return undefined;
  });
}

export async function setReceiptSupplier(rawInput: unknown): Promise<StockResult> {
  const parsed = documentIdSchema.extend(createReceiptSchema.shape).safeParse(rawInput);
  if (!parsed.success) return invalid();
  const { id, ...data } = parsed.data;
  const updated = await prisma.goodsReceipt.updateMany({ where: { id, status: "open" }, data });
  return updated.count === 1 ? { ok: true, data: undefined } : { ok: false, message: "Diese Lieferung ist schon gebucht." };
}

/**
 * Books a whole delivery: per line an optional lot (when MHD or batch is
 * given), one receipt movement, and the article's EK / pack size / default
 * supplier are updated. The status update claims the receipt first, so a
 * double click can never book it twice.
 */
export async function bookReceipt(rawInput: unknown): Promise<StockResult<{ lines: number }>> {
  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) return invalid();
  return runStockTx(async (tx, buffer) => {
    const claimed = await tx.goodsReceipt.updateMany({
      where: { id: parsed.data.id, status: "open" },
      data: { status: "booked", bookedAt: new Date() },
    });
    if (claimed.count === 0) throw new StockError("Diese Lieferung ist schon gebucht oder abgebrochen.");
    const receipt = await tx.goodsReceipt.findUniqueOrThrow({
      where: { id: parsed.data.id },
      include: { lines: { orderBy: [{ productId: "asc" }, { createdAt: "asc" }] } },
    });
    if (receipt.lines.length === 0) throw new StockError("Die Lieferung hat noch keine Artikel.");

    for (const line of receipt.lines) {
      const lot =
        line.expiryDate || line.batchCode
          ? await tx.stockLot.create({
              data: {
                productId: line.productId,
                supplierId: receipt.supplierId,
                expiryDate: line.expiryDate,
                batchCode: line.batchCode,
                receivedAt: new Date(),
              },
            })
          : null;
      await bookMovement(
        tx,
        {
          productId: line.productId,
          type: "receipt",
          quantity: line.quantity,
          unitCostRappen: line.unitCostRappen,
          supplierId: receipt.supplierId,
          lotId: lot?.id ?? null,
          goodsReceiptId: receipt.id,
          note: receipt.deliveryNote ? `Lieferschein ${receipt.deliveryNote}` : null,
        },
        buffer,
      );
      const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId }, select: { defaultSupplierId: true } });
      await tx.product.update({
        where: { id: line.productId },
        data: {
          packSize: line.packSize,
          ...(line.unitCostRappen !== null && { purchasePriceRappen: line.unitCostRappen }),
          ...(product.defaultSupplierId === null && receipt.supplierId && { defaultSupplierId: receipt.supplierId }),
        },
      });
    }
    return { lines: receipt.lines.length };
  });
}

export async function cancelReceipt(rawInput: unknown): Promise<StockResult> {
  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) return invalid();
  const updated = await prisma.goodsReceipt.updateMany({ where: { id: parsed.data.id, status: "open" }, data: { status: "cancelled" } });
  return updated.count === 1 ? { ok: true, data: undefined } : { ok: false, message: "Diese Lieferung ist schon gebucht." };
}
