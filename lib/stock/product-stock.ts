import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeGtin } from "@/lib/barcode";
import { bookMovement, ledgerSum, setStockTracking, StockError, undoMovement, type StockDb } from "./ledger";
import { allocateStockToLots, type AllocatedLot } from "./lots";
import { movementIdSchema, productMovementSchema, productStockSettingsSchema, writeOffLotSchema } from "./schemas";
import { runStockTx, type StockResult } from "./run";
import type { StockUnitType } from "./units";

/** What the scan modes (Wareneingang, Verkauf, Inventur) need about an article. */
export interface StockProductView {
  id: string;
  sku: string;
  ean: string | null;
  nameDe: string;
  nameOriginal: string | null;
  brand: string | null;
  unitType: StockUnitType;
  stockQty: number | null;
  packSize: number;
  purchasePriceRappen: number | null;
  priceRappen: number;
  defaultSupplierId: string | null;
  archived: boolean;
}

const STOCK_PRODUCT_SELECT = {
  id: true,
  sku: true,
  ean: true,
  nameDe: true,
  nameOriginal: true,
  brand: true,
  unitType: true,
  stockQty: true,
  packSize: true,
  purchasePriceRappen: true,
  priceRappen: true,
  defaultSupplierId: true,
  archivedAt: true,
} as const;

function toView(row: {
  archivedAt: Date | null;
} & Omit<StockProductView, "archived">): StockProductView {
  const { archivedAt, ...rest } = row;
  return { ...rest, archived: archivedAt !== null };
}

/** Barcode lookup for the stock scan modes (normalized like /scan: UPC-A -> EAN-13). */
export async function findStockProductByEan(rawEan: string): Promise<StockProductView | null> {
  const ean = normalizeGtin(rawEan) ?? rawEan.trim();
  const row = await prisma.product.findUnique({ where: { ean }, select: STOCK_PRODUCT_SELECT });
  return row ? toView(row) : null;
}

/** Name / SKU / original-name search for articles without a barcode (hard rule 6). */
export async function searchStockProducts(query: string): Promise<StockProductView[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.product.findMany({
    where: {
      archivedAt: null,
      OR: [
        { nameDe: { contains: q, mode: "insensitive" } },
        { nameOriginal: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { ean: { startsWith: q } },
      ],
    },
    select: STOCK_PRODUCT_SELECT,
    orderBy: { nameDe: "asc" },
    take: 12,
  });
  return rows.map(toView);
}

export async function getStockProduct(id: string): Promise<StockProductView | null> {
  const row = await prisma.product.findUnique({ where: { id }, select: STOCK_PRODUCT_SELECT });
  return row ? toView(row) : null;
}

/** Stock settings on the article page: tracking, reorder rule, pack size, EK, supplier. */
export async function saveProductStockSettings(rawInput: unknown): Promise<StockResult> {
  const parsed = productStockSettingsSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  const { productId, tracked, ...fields } = parsed.data;
  return runStockTx(async (tx, buffer) => {
    const updated = await tx.product.updateMany({ where: { id: productId }, data: fields });
    if (updated.count === 0) throw new StockError("Artikel nicht gefunden.");
    await setStockTracking(tx, productId, tracked, buffer);
    return undefined;
  });
}

async function stockNow(tx: StockDb, productId: string): Promise<number> {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { stockQty: true } });
  if (!product) throw new StockError("Artikel nicht gefunden.");
  return product.stockQty ?? (await ledgerSum(tx, productId));
}

/** Abschreiben, Retour, Bestand korrigieren, manuelle Buchung from the article page. */
export async function bookProductMovement(rawInput: unknown): Promise<StockResult<{ stockAfter: number } | null>> {
  const parsed = productMovementSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  const input = parsed.data;
  return runStockTx(async (tx, buffer) => {
    switch (input.kind) {
      case "waste": {
        const booked = await bookMovement(
          tx,
          { productId: input.productId, type: "waste", quantity: -input.quantity, wasteReason: input.wasteReason, note: input.note },
          buffer,
        );
        return { stockAfter: booked.stockAfter };
      }
      case "return": {
        const booked = await bookMovement(
          tx,
          { productId: input.productId, type: "return_to_supplier", quantity: -input.quantity, supplierId: input.supplierId, note: input.note },
          buffer,
        );
        return { stockAfter: booked.stockAfter };
      }
      case "correction": {
        const diff = input.countedQty - (await stockNow(tx, input.productId));
        if (diff === 0) {
          // Nothing to correct, but counting means "track this from now on".
          await setStockTracking(tx, input.productId, true, buffer);
          return null;
        }
        const booked = await bookMovement(tx, { productId: input.productId, type: "count_correction", quantity: diff, note: input.note }, buffer);
        return { stockAfter: booked.stockAfter };
      }
      case "manual": {
        const booked = await bookMovement(tx, { productId: input.productId, type: "manual", quantity: input.quantity, note: input.note }, buffer);
        return { stockAfter: booked.stockAfter };
      }
    }
  });
}

/** One-click write-off of what is left of a lot (MHD list). */
export async function writeOffLot(rawInput: unknown): Promise<StockResult<{ quantity: number }>> {
  const parsed = writeOffLotSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  return runStockTx(async (tx, buffer) => {
    const lot = await tx.stockLot.findUnique({ where: { id: parsed.data.lotId }, select: { id: true, productId: true } });
    if (!lot) throw new StockError("Charge nicht gefunden.");
    // Lock first, then derive what is left of this lot from the current state.
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ${lot.productId} FOR UPDATE`;
    const remaining = (await lotRemaining(tx, lot.productId)).get(lot.id) ?? 0;
    if (remaining <= 0) throw new StockError("Von dieser Charge ist nichts mehr am Lager.");
    await bookMovement(
      tx,
      { productId: lot.productId, type: "waste", quantity: -remaining, wasteReason: parsed.data.wasteReason, lotId: lot.id, note: null },
      buffer,
    );
    return { quantity: remaining };
  });
}

/** Lots of one product in FEFO order with the stock attributed to each (lib/stock/lots.ts). */
export async function lotAllocation(db: StockDb, productId: string): Promise<AllocatedLot[]> {
  const [stock, lots, sums] = await Promise.all([
    stockNow(db, productId),
    db.stockLot.findMany({ where: { productId }, select: { id: true, expiryDate: true, receivedAt: true } }),
    db.stockMovement.groupBy({ by: ["lotId"], where: { productId, lotId: { not: null } }, _sum: { quantity: true } }),
  ]);
  const own = new Map(sums.map((row) => [row.lotId as string, row._sum.quantity ?? 0]));
  return allocateStockToLots(
    stock,
    lots.map((lot) => ({ ...lot, ownQty: own.get(lot.id) ?? 0 })),
  );
}

/** Remaining quantity per lot of one product. */
export async function lotRemaining(db: StockDb, productId: string): Promise<Map<string, number>> {
  return new Map((await lotAllocation(db, productId)).map((lot) => [lot.id, lot.remaining]));
}

export async function undoStockMovement(rawInput: unknown): Promise<StockResult<{ productId: string }>> {
  const parsed = movementIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Ungültige Eingabe." };
  return runStockTx(async (tx, buffer) => {
    const booked = await undoMovement(tx, parsed.data.movementId, buffer);
    return { productId: booked.movement.productId };
  });
}
