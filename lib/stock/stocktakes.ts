import "server-only";
import { prisma } from "@/lib/prisma";
import { bookMovement, ledgerSum, setStockTracking, StockError, type StockDb } from "./ledger";
import { countLineSchema, createStocktakeSchema, documentIdSchema, stocktakeLineIdSchema } from "./schemas";
import { correctionFor } from "./stocktake-math";
import { runStockTx, type StockResult } from "./run";

// Inventur: count per article (scan or type), check the diff list, then book.
// Booking applies counted - expected-at-count-time to the stock at booking
// time (lib/stock/stocktake-math.ts), so sales during a long count are kept.

export async function createStocktake(rawInput: unknown): Promise<StockResult<{ id: string }>> {
  const parsed = createStocktakeSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  const stocktake = await prisma.stocktake.create({ data: parsed.data });
  return { ok: true, data: { id: stocktake.id } };
}

async function requireOpen(db: StockDb, stocktakeId: string): Promise<void> {
  const stocktake = await db.stocktake.findUnique({ where: { id: stocktakeId }, select: { status: true } });
  if (!stocktake) throw new StockError("Inventur nicht gefunden.");
  if (stocktake.status !== "open") throw new StockError("Diese Inventur ist schon gebucht oder abgebrochen.");
}

/** Sets ("set") or raises by one scan ("add") the count of one article; snapshots the expected stock. */
export async function countStocktakeLine(rawInput: unknown): Promise<StockResult<{ countedQty: number; expectedQty: number }>> {
  const parsed = countLineSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Bitte eine ganze Zahl ab 0 eingeben." };
  const { stocktakeId, productId, mode, quantity } = parsed.data;
  return runStockTx(async (tx) => {
    await requireOpen(tx, stocktakeId);
    const product = await tx.product.findUnique({ where: { id: productId }, select: { stockQty: true } });
    if (!product) throw new StockError("Artikel nicht gefunden.");
    const expectedQty = product.stockQty ?? (await ledgerSum(tx, productId));
    const existing = await tx.stocktakeLine.findUnique({ where: { stocktakeId_productId: { stocktakeId, productId } } });
    const countedQty = mode === "add" ? (existing?.countedQty ?? 0) + quantity : quantity;
    // A recount keeps the expectation of the first count only if nothing
    // moved since; otherwise the newest snapshot belongs to the newest count.
    await tx.stocktakeLine.upsert({
      where: { stocktakeId_productId: { stocktakeId, productId } },
      create: { stocktakeId, productId, countedQty, expectedQty, countedAt: new Date() },
      update: { countedQty, expectedQty, countedAt: new Date() },
    });
    return { countedQty, expectedQty };
  });
}

export async function removeStocktakeLine(rawInput: unknown): Promise<StockResult> {
  const parsed = stocktakeLineIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  return runStockTx(async (tx) => {
    await requireOpen(tx, parsed.data.stocktakeId);
    await tx.stocktakeLine.deleteMany({ where: parsed.data });
    return undefined;
  });
}

/** Books all counted lines as count_correction movements; counted articles without tracking start tracking. */
export async function bookStocktake(rawInput: unknown): Promise<StockResult<{ corrected: number }>> {
  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  return runStockTx(async (tx, buffer) => {
    const claimed = await tx.stocktake.updateMany({
      where: { id: parsed.data.id, status: "open" },
      data: { status: "booked", bookedAt: new Date() },
    });
    if (claimed.count === 0) throw new StockError("Diese Inventur ist schon gebucht oder abgebrochen.");
    const lines = await tx.stocktakeLine.findMany({ where: { stocktakeId: parsed.data.id }, orderBy: { productId: "asc" } });
    if (lines.length === 0) throw new StockError("Es wurde noch nichts gezählt.");
    let corrected = 0;
    for (const line of lines) {
      const diff = correctionFor(line);
      if (diff === 0) {
        await setStockTracking(tx, line.productId, true, buffer);
        continue;
      }
      await bookMovement(
        tx,
        { productId: line.productId, type: "count_correction", quantity: diff, stocktakeId: parsed.data.id, note: null },
        buffer,
      );
      corrected += 1;
    }
    return { corrected };
  });
}

export async function cancelStocktake(rawInput: unknown): Promise<StockResult> {
  const parsed = documentIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  const updated = await prisma.stocktake.updateMany({ where: { id: parsed.data.id, status: "open" }, data: { status: "cancelled" } });
  return updated.count === 1 ? { ok: true, data: undefined } : { ok: false, message: "Diese Inventur ist schon gebucht." };
}
