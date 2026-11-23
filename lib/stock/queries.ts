import "server-only";
import { prisma } from "@/lib/prisma";
import { computeMargin, type Margin } from "./margin";
import { expiryBucket, fefoNext, type ExpiryBucket } from "./lots";
import { canUndoType, type StockMovementType, type WasteReason } from "./movement-rules";
import { buildReorderList, type ReorderGroup } from "./reorder";
import { isDeadStock, isLowStock, isNegativeStock, stockValue } from "./overview-math";
import { buildInventoryList, type InventoryList } from "./inventory-list";
import { endOfShopDay, shopToday, parseDateOnly } from "./dates";
import { correctionFor, stocktakeDiff, type DiffSummary } from "./stocktake-math";
import { lotAllocation } from "./product-stock";
import { getSafetyBuffer } from "./ledger";
import { valueRappen, type StockUnitType } from "./units";

// Read side of the stock pages. Everything here is plain serialisable data
// (dates as ISO strings, no Prisma.Decimal), ready for client components.

export interface MovementView {
  id: string;
  createdAt: string;
  type: StockMovementType;
  quantity: number;
  stockAfter: number;
  unitCostRappen: number | null;
  wasteReason: WasteReason | null;
  note: string | null;
  productId: string;
  productName: string;
  sku: string;
  unitType: StockUnitType;
  supplierName: string | null;
  shopOrderId: string | null;
  isReversal: boolean;
  reversed: boolean;
  /** Newest movement of its article, not a reversal, not undone, not a web sale. */
  canUndo: boolean;
}

const MOVEMENT_INCLUDE = {
  product: { select: { nameDe: true, sku: true, unitType: true } },
  supplier: { select: { name: true } },
  reversedBy: { select: { id: true } },
} as const;

type MovementRow = Awaited<ReturnType<typeof fetchMovements>>[number];

function fetchMovements(where: object, take: number) {
  return prisma.stockMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: MOVEMENT_INCLUDE,
  });
}

/** Ids of the newest movement per article, for the "Rückgängig" button. */
async function newestMovementIds(productIds: string[]): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT ON ("productId") "id" FROM "StockMovement"
    WHERE "productId" = ANY(${productIds})
    ORDER BY "productId", "createdAt" DESC, "id" DESC`;
  return new Set(rows.map((row) => row.id));
}

async function toMovementViews(rows: MovementRow[]): Promise<MovementView[]> {
  const newest = await newestMovementIds([...new Set(rows.map((row) => row.productId))]);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    type: row.type,
    quantity: row.quantity,
    stockAfter: row.stockAfter,
    unitCostRappen: row.unitCostRappen,
    wasteReason: row.wasteReason,
    note: row.note,
    productId: row.productId,
    productName: row.product.nameDe,
    sku: row.product.sku,
    unitType: row.product.unitType,
    supplierName: row.supplier?.name ?? null,
    shopOrderId: row.shopOrderId,
    isReversal: row.reversesId !== null,
    reversed: row.reversedBy !== null,
    canUndo: newest.has(row.id) && row.reversesId === null && row.reversedBy === null && canUndoType(row.type),
  }));
}

export async function listMovements(filter: { type?: StockMovementType | null; productId?: string }, take = 200): Promise<MovementView[]> {
  const where = { ...(filter.type && { type: filter.type }), ...(filter.productId && { productId: filter.productId }) };
  return toMovementViews(await fetchMovements(where, take));
}

export interface StockListItem {
  id: string;
  nameDe: string;
  sku: string;
  unitType: StockUnitType;
  stockQty: number;
  minStock: number | null;
}

export interface ExpiryRow {
  lotId: string;
  productId: string;
  nameDe: string;
  sku: string;
  unitType: StockUnitType;
  expiryDate: string;
  batchCode: string | null;
  supplierName: string | null;
  remaining: number;
  bucket: ExpiryBucket;
  /** This is the lot to sell first (FEFO). */
  sellFirst: boolean;
}

/** Lots with stock left that are expired or expire within `days` days, earliest first. */
export async function getExpiryList(days = 30, now = new Date()): Promise<ExpiryRow[]> {
  const today = parseDateOnly(shopToday(now)) as Date;
  const horizon = new Date(today.getTime() + days * 86_400_000);
  const candidates = await prisma.stockLot.findMany({
    where: { expiryDate: { not: null, lte: horizon }, product: { stockQty: { not: null } } },
    select: { productId: true },
    distinct: ["productId"],
  });
  const rows: ExpiryRow[] = [];
  for (const { productId } of candidates) {
    const [product, lots, allocated] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { nameDe: true, sku: true, unitType: true } }),
      prisma.stockLot.findMany({ where: { productId }, include: { supplier: { select: { name: true } } } }),
      lotAllocation(prisma, productId),
    ]);
    const remaining = new Map(allocated.map((lot) => [lot.id, lot.remaining]));
    // The hint only matters when there is more than one delivery to choose from.
    const first = allocated.filter((lot) => lot.remaining > 0).length > 1 ? fefoNext(allocated) : null;
    for (const lot of lots) {
      const left = remaining.get(lot.id) ?? 0;
      if (!lot.expiryDate || left <= 0 || lot.expiryDate > horizon) continue;
      rows.push({
        lotId: lot.id,
        productId,
        nameDe: product.nameDe,
        sku: product.sku,
        unitType: product.unitType,
        expiryDate: lot.expiryDate.toISOString().slice(0, 10),
        batchCode: lot.batchCode,
        supplierName: lot.supplier?.name ?? null,
        remaining: left,
        bucket: expiryBucket(lot.expiryDate, now),
        sellFirst: first?.id === lot.id,
      });
    }
  }
  return rows.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.nameDe.localeCompare(b.nameDe, "de-CH"));
}

export interface StockOverview {
  trackedCount: number;
  valueRappen: number;
  withoutCost: number;
  low: StockListItem[];
  negative: StockListItem[];
  dead: (StockListItem & { lastMovementAt: string | null })[];
  expiring: ExpiryRow[];
  recent: MovementView[];
  openReceipts: number;
  openStocktakes: number;
  safetyBuffer: number;
}

export async function getStockOverview(now = new Date()): Promise<StockOverview> {
  const [tracked, lastMovements, expiring, recentRows, openReceipts, openStocktakes, safetyBuffer] = await Promise.all([
    prisma.product.findMany({
      where: { stockQty: { not: null }, archivedAt: null },
      select: { id: true, nameDe: true, sku: true, unitType: true, stockQty: true, minStock: true, purchasePriceRappen: true },
      orderBy: { nameDe: "asc" },
    }),
    prisma.stockMovement.groupBy({ by: ["productId"], _max: { createdAt: true } }),
    getExpiryList(30, now),
    fetchMovements({}, 15),
    prisma.goodsReceipt.count({ where: { status: "open" } }),
    prisma.stocktake.count({ where: { status: "open" } }),
    getSafetyBuffer(prisma),
  ]);
  const lastById = new Map(lastMovements.map((row) => [row.productId, row._max.createdAt]));
  const items = tracked.map((product) => ({
    ...product,
    stockQty: product.stockQty as number,
    lastMovementAt: lastById.get(product.id) ?? null,
  }));
  const value = stockValue(items);
  const strip = ({ id, nameDe, sku, unitType, stockQty, minStock }: (typeof items)[number]): StockListItem => ({ id, nameDe, sku, unitType, stockQty, minStock });
  return {
    trackedCount: items.length,
    valueRappen: value.valueRappen,
    withoutCost: value.withoutCost,
    low: items.filter(isLowStock).map(strip),
    negative: items.filter(isNegativeStock).map(strip),
    dead: items
      .filter((item) => isDeadStock(item, now))
      .map((item) => ({ ...strip(item), lastMovementAt: item.lastMovementAt?.toISOString() ?? null })),
    expiring,
    recent: await toMovementViews(recentRows),
    openReceipts,
    openStocktakes,
    safetyBuffer,
  };
}

export async function getReorderGroups(): Promise<ReorderGroup[]> {
  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { archivedAt: null, stockQty: { not: null }, minStock: { not: null } },
      select: { id: true, sku: true, ean: true, nameDe: true, unitType: true, stockQty: true, minStock: true, reorderQty: true, packSize: true, defaultSupplierId: true },
    }),
    prisma.supplier.findMany({ select: { id: true, name: true, customerNumber: true, phone: true, email: true } }),
  ]);
  return buildReorderList(
    products.map(({ defaultSupplierId, ...product }) => ({ ...product, supplierId: defaultSupplierId })),
    suppliers,
  );
}

/**
 * Inventory list at EK. With a cut-off date the quantities are the ledger
 * sums up to the end of that shop day; without one, the current stock.
 */
export async function getInventoryList(cutoff: string | null): Promise<InventoryList> {
  const end = cutoff ? endOfShopDay(cutoff) : null;
  const products = await prisma.product.findMany({
    where: end ? { stockMovements: { some: {} } } : { stockQty: { not: null } },
    select: {
      id: true,
      sku: true,
      ean: true,
      nameDe: true,
      nameOriginal: true,
      unitType: true,
      stockQty: true,
      purchasePriceRappen: true,
      category: { select: { name: true } },
    },
  });
  let qtyById: Map<string, number>;
  if (end) {
    const sums = await prisma.stockMovement.groupBy({ by: ["productId"], where: { createdAt: { lt: end } }, _sum: { quantity: true } });
    qtyById = new Map(sums.map((row) => [row.productId, row._sum.quantity ?? 0]));
  } else {
    qtyById = new Map(products.map((product) => [product.id, product.stockQty ?? 0]));
  }
  return buildInventoryList(
    products.map((product) => ({
      sku: product.sku,
      ean: product.ean,
      nameDe: product.nameDe,
      nameOriginal: product.nameOriginal,
      category: product.category.name,
      unitType: product.unitType,
      qty: qtyById.get(product.id) ?? 0,
      purchasePriceRappen: product.purchasePriceRappen,
    })),
  );
}

export interface LotView {
  id: string;
  expiryDate: string | null;
  batchCode: string | null;
  receivedAt: string;
  supplierName: string | null;
  remaining: number;
}

export interface ProductStockCard {
  productId: string;
  unitType: StockUnitType;
  tracked: boolean;
  stockQty: number | null;
  isAvailable: boolean;
  safetyBuffer: number;
  minStock: number | null;
  reorderQty: number | null;
  packSize: number;
  purchasePriceRappen: number | null;
  priceRappen: number;
  defaultSupplierId: string | null;
  margin: Margin | null;
  lots: LotView[];
  sellFirstLotId: string | null;
  movements: MovementView[];
  movementCount: number;
}

export async function getProductStockCard(productId: string): Promise<ProductStockCard | null> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;
  const [lots, allocated, movements, movementCount, safetyBuffer] = await Promise.all([
    prisma.stockLot.findMany({ where: { productId }, include: { supplier: { select: { name: true } } } }),
    lotAllocation(prisma, productId),
    listMovements({ productId }, 8),
    prisma.stockMovement.count({ where: { productId } }),
    getSafetyBuffer(prisma),
  ]);
  const lotById = new Map(lots.map((lot) => [lot.id, lot]));
  return {
    productId,
    unitType: product.unitType,
    tracked: product.stockQty !== null,
    stockQty: product.stockQty,
    isAvailable: product.isAvailable,
    safetyBuffer,
    minStock: product.minStock,
    reorderQty: product.reorderQty,
    packSize: product.packSize,
    purchasePriceRappen: product.purchasePriceRappen,
    priceRappen: product.priceRappen,
    defaultSupplierId: product.defaultSupplierId,
    margin: computeMargin({
      priceRappen: product.priceRappen,
      vatRate: product.vatRate.toNumber(),
      unitType: product.unitType,
      contentAmount: product.contentAmount?.toNumber() ?? null,
      contentUnit: product.contentUnit,
      purchasePriceRappen: product.purchasePriceRappen,
    }),
    lots: allocated
      .filter((lot) => lot.remaining > 0)
      .map((lot) => ({
        id: lot.id,
        expiryDate: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
        batchCode: lotById.get(lot.id)?.batchCode ?? null,
        receivedAt: lot.receivedAt.toISOString(),
        supplierName: lotById.get(lot.id)?.supplier?.name ?? null,
        remaining: lot.remaining,
      })),
    sellFirstLotId: allocated.filter((lot) => lot.remaining > 0).length > 1 ? (fefoNext(allocated)?.id ?? null) : null,
    movements,
    movementCount,
  };
}

// ---- Wareneingang ----

export interface ReceiptListItem {
  id: string;
  status: "open" | "booked" | "cancelled";
  supplierName: string | null;
  deliveryNote: string | null;
  lineCount: number;
  createdAt: string;
  bookedAt: string | null;
}

export async function listReceipts(): Promise<ReceiptListItem[]> {
  const rows = await prisma.goodsReceipt.findMany({
    where: { OR: [{ status: "open" }, { status: "booked" }] },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { supplier: { select: { name: true } }, _count: { select: { lines: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    supplierName: row.supplier?.name ?? null,
    deliveryNote: row.deliveryNote,
    lineCount: row._count.lines,
    createdAt: row.createdAt.toISOString(),
    bookedAt: row.bookedAt?.toISOString() ?? null,
  }));
}

export interface ReceiptLineView {
  id: string;
  productId: string;
  nameDe: string;
  sku: string;
  ean: string | null;
  unitType: StockUnitType;
  packs: number;
  packSize: number;
  quantity: number;
  unitCostRappen: number | null;
  expiryDate: string | null;
  batchCode: string | null;
}

export interface ReceiptDetail {
  id: string;
  status: "open" | "booked" | "cancelled";
  supplierId: string | null;
  supplierName: string | null;
  deliveryNote: string | null;
  createdAt: string;
  bookedAt: string | null;
  lines: ReceiptLineView[];
  totalCostRappen: number;
  linesWithoutCost: number;
}

export async function getReceipt(id: string): Promise<ReceiptDetail | null> {
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      lines: { orderBy: { createdAt: "desc" }, include: { product: { select: { nameDe: true, sku: true, ean: true, unitType: true } } } },
    },
  });
  if (!receipt) return null;
  let total = 0;
  let withoutCost = 0;
  const lines = receipt.lines.map((line) => {
    if (line.unitCostRappen === null) withoutCost += 1;
    else total += valueRappen(line.quantity, line.product.unitType, line.unitCostRappen);
    return {
      id: line.id,
      productId: line.productId,
      nameDe: line.product.nameDe,
      sku: line.product.sku,
      ean: line.product.ean,
      unitType: line.product.unitType,
      packs: line.packs,
      packSize: line.packSize,
      quantity: line.quantity,
      unitCostRappen: line.unitCostRappen,
      expiryDate: line.expiryDate?.toISOString().slice(0, 10) ?? null,
      batchCode: line.batchCode,
    };
  });
  return {
    id: receipt.id,
    status: receipt.status,
    supplierId: receipt.supplierId,
    supplierName: receipt.supplier?.name ?? null,
    deliveryNote: receipt.deliveryNote,
    createdAt: receipt.createdAt.toISOString(),
    bookedAt: receipt.bookedAt?.toISOString() ?? null,
    lines,
    totalCostRappen: total,
    linesWithoutCost: withoutCost,
  };
}

// ---- Inventur ----

export interface StocktakeListItem {
  id: string;
  title: string;
  status: "open" | "booked" | "cancelled";
  categoryName: string | null;
  lineCount: number;
  createdAt: string;
  bookedAt: string | null;
}

export async function listStocktakes(): Promise<StocktakeListItem[]> {
  const rows = await prisma.stocktake.findMany({
    where: { status: { in: ["open", "booked"] } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 50,
    include: { _count: { select: { lines: true } } },
  });
  const categoryIds = rows.flatMap((row) => (row.categoryId ? [row.categoryId] : []));
  const categories = new Map(
    (await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    categoryName: row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
    lineCount: row._count.lines,
    createdAt: row.createdAt.toISOString(),
    bookedAt: row.bookedAt?.toISOString() ?? null,
  }));
}

export interface StocktakeLineView {
  productId: string;
  nameDe: string;
  sku: string;
  ean: string | null;
  unitType: StockUnitType;
  countedQty: number;
  expectedQty: number;
  diff: number;
  diffValueRappen: number | null;
  countedAt: string;
}

export interface StocktakeDetail {
  id: string;
  title: string;
  status: "open" | "booked" | "cancelled";
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  bookedAt: string | null;
  lines: StocktakeLineView[];
  summary: Omit<DiffSummary, "lines">;
  /** Articles of the chosen category not counted yet (only with a category). */
  notCounted: { id: string; nameDe: string; sku: string; unitType: StockUnitType; stockQty: number | null }[];
}

export async function getStocktake(id: string): Promise<StocktakeDetail | null> {
  const stocktake = await prisma.stocktake.findUnique({
    where: { id },
    include: {
      lines: {
        orderBy: { countedAt: "desc" },
        include: { product: { select: { nameDe: true, sku: true, ean: true, unitType: true, purchasePriceRappen: true } } },
      },
    },
  });
  if (!stocktake) return null;
  const category = stocktake.categoryId
    ? await prisma.category.findUnique({ where: { id: stocktake.categoryId }, select: { name: true } })
    : null;
  const counted = new Set(stocktake.lines.map((line) => line.productId));
  const notCounted =
    stocktake.categoryId && stocktake.status === "open"
      ? (
          await prisma.product.findMany({
            where: { categoryId: stocktake.categoryId, archivedAt: null },
            select: { id: true, nameDe: true, sku: true, unitType: true, stockQty: true },
            orderBy: { nameDe: "asc" },
          })
        ).filter((product) => !counted.has(product.id))
      : [];
  const diff = stocktakeDiff(
    stocktake.lines.map((line) => ({
      productId: line.productId,
      countedQty: line.countedQty,
      expectedQty: line.expectedQty,
      unitType: line.product.unitType,
      purchasePriceRappen: line.product.purchasePriceRappen,
    })),
  );
  const lineById = new Map(stocktake.lines.map((line) => [line.productId, line]));
  const { lines: diffLines, ...summary } = diff;
  return {
    id: stocktake.id,
    title: stocktake.title,
    status: stocktake.status,
    categoryId: stocktake.categoryId,
    categoryName: category?.name ?? null,
    createdAt: stocktake.createdAt.toISOString(),
    bookedAt: stocktake.bookedAt?.toISOString() ?? null,
    lines: diffLines.map((line) => {
      const row = lineById.get(line.productId)!;
      return {
        productId: line.productId,
        nameDe: row.product.nameDe,
        sku: row.product.sku,
        ean: row.product.ean,
        unitType: line.unitType,
        countedQty: line.countedQty,
        expectedQty: line.expectedQty,
        diff: correctionFor(line),
        diffValueRappen: line.diffValueRappen,
        countedAt: row.countedAt.toISOString(),
      };
    }),
    summary,
    notCounted,
  };
}
