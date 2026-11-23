import { formatPacks, formatStockQty, type StockUnitType } from "./units";

export interface ReorderProduct {
  id: string;
  sku: string;
  ean: string | null;
  nameDe: string;
  unitType: StockUnitType;
  stockQty: number | null;
  minStock: number | null;
  reorderQty: number | null;
  packSize: number;
  supplierId: string | null;
}

export interface ReorderSupplier {
  id: string;
  name: string;
  customerNumber: string | null;
  phone: string | null;
  email: string | null;
}

export interface ReorderLine extends ReorderProduct {
  /** Suggested order quantity in stock units, a whole number of packs. */
  orderQty: number;
}

export interface ReorderGroup {
  supplier: ReorderSupplier | null;
  lines: ReorderLine[];
}

/** Tracked, with a reorder point, and at or below it. */
export function needsReorder(product: Pick<ReorderProduct, "stockQty" | "minStock">): boolean {
  return product.stockQty !== null && product.minStock !== null && product.stockQty <= product.minStock;
}

/**
 * Order quantity: the article's reorder quantity if set, otherwise enough to
 * fill up to twice the reorder point. Never less than one pack, always
 * rounded up to whole packs (suppliers deliver cartons).
 */
export function suggestedOrderQty(product: Pick<ReorderProduct, "stockQty" | "minStock" | "reorderQty" | "packSize">): number {
  const pack = Math.max(1, product.packSize);
  const stock = product.stockQty ?? 0;
  const min = product.minStock ?? 0;
  const wanted = product.reorderQty && product.reorderQty > 0 ? product.reorderQty : Math.max(min * 2 - stock, 1);
  return Math.max(1, Math.ceil(wanted / pack)) * pack;
}

/** The "Nachbestellen" list: per supplier (by name, "ohne Lieferant" last), articles by name. */
export function buildReorderList(products: ReorderProduct[], suppliers: ReorderSupplier[]): ReorderGroup[] {
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const groups = new Map<string, ReorderGroup>();
  for (const product of products) {
    if (!needsReorder(product)) continue;
    const supplier = product.supplierId ? (supplierById.get(product.supplierId) ?? null) : null;
    const key = supplier?.id ?? "";
    let group = groups.get(key);
    if (!group) {
      group = { supplier, lines: [] };
      groups.set(key, group);
    }
    group.lines.push({ ...product, orderQty: suggestedOrderQty(product) });
  }
  const list = [...groups.values()];
  for (const group of list) group.lines.sort((a, b) => a.nameDe.localeCompare(b.nameDe, "de-CH"));
  return list.sort((a, b) => {
    if (!a.supplier) return 1;
    if (!b.supplier) return -1;
    return a.supplier.name.localeCompare(b.supplier.name, "de-CH");
  });
}

/** One order line in plain words: "3 Karton à 24 Stk  Shin Ramyun (EAN 8801043014809)". */
export function orderLineText(line: ReorderLine): string {
  const ean = line.ean ? ` (EAN ${line.ean})` : ` (${line.sku})`;
  return `- ${formatPacks(line.orderQty, line.packSize, line.unitType)}  ${line.nameDe}${ean}`;
}

/**
 * Plain-text order message to copy into WhatsApp or an e-mail. The app never
 * sends it; the shop owner does.
 */
export function orderMessage(group: ReorderGroup, shopName = "Asia To Go, Schaffhausen"): string {
  const customer = group.supplier?.customerNumber ? ` (Kundennummer ${group.supplier.customerNumber})` : "";
  return [
    "Guten Tag",
    "",
    `Wir möchten gerne bestellen${customer}:`,
    "",
    ...group.lines.map(orderLineText),
    "",
    "Vielen Dank und freundliche Grüsse",
    shopName,
  ].join("\n");
}

/** "noch 2 Stk, Meldebestand 6" for the list. */
export function reorderReason(line: ReorderLine): string {
  return `noch ${formatStockQty(line.stockQty ?? 0, line.unitType)}, Meldebestand ${formatStockQty(line.minStock ?? 0, line.unitType)}`;
}
