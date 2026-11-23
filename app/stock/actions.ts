"use server";

// Thin server-action wrappers; the logic lives in lib/stock/ (convention:
// server logic in lib/). Every input is validated there with Zod.

import { findStockProductByEan, searchStockProducts, bookProductMovement, saveProductStockSettings, undoStockMovement, writeOffLot } from "@/lib/stock/product-stock";
import { addReceiptLine, bookReceipt, cancelReceipt, createReceipt, removeReceiptLine, setReceiptSupplier } from "@/lib/stock/receipts";
import { bookStocktake, cancelStocktake, countStocktakeLine, createStocktake, removeStocktakeLine } from "@/lib/stock/stocktakes";
import { bookShopSale } from "@/lib/stock/sales";
import { archiveSupplier, saveSupplier } from "@/lib/stock/suppliers";
import { cancelWebOrder } from "@/lib/stock/order-cancel";
import { saveSafetyBuffer } from "@/lib/stock/settings";

export async function lookupStockProductAction(ean: string) {
  if (typeof ean !== "string" || ean.length > 32) return null;
  return findStockProductByEan(ean);
}

export async function searchStockProductsAction(query: string) {
  if (typeof query !== "string" || query.length > 100) return [];
  return searchStockProducts(query);
}

export async function saveProductStockSettingsAction(input: unknown) {
  return saveProductStockSettings(input);
}

export async function bookProductMovementAction(input: unknown) {
  return bookProductMovement(input);
}

export async function undoStockMovementAction(input: unknown) {
  return undoStockMovement(input);
}

export async function writeOffLotAction(input: unknown) {
  return writeOffLot(input);
}

export async function createReceiptAction(input: unknown) {
  return createReceipt(input);
}

export async function setReceiptSupplierAction(input: unknown) {
  return setReceiptSupplier(input);
}

export async function addReceiptLineAction(input: unknown) {
  return addReceiptLine(input);
}

export async function removeReceiptLineAction(input: unknown) {
  return removeReceiptLine(input);
}

export async function bookReceiptAction(input: unknown) {
  return bookReceipt(input);
}

export async function cancelReceiptAction(input: unknown) {
  return cancelReceipt(input);
}

export async function createStocktakeAction(input: unknown) {
  return createStocktake(input);
}

export async function countStocktakeLineAction(input: unknown) {
  return countStocktakeLine(input);
}

export async function removeStocktakeLineAction(input: unknown) {
  return removeStocktakeLine(input);
}

export async function bookStocktakeAction(input: unknown) {
  return bookStocktake(input);
}

export async function cancelStocktakeAction(input: unknown) {
  return cancelStocktake(input);
}

export async function bookShopSaleAction(input: unknown) {
  return bookShopSale(input);
}

export async function saveSupplierAction(input: unknown) {
  return saveSupplier(input);
}

export async function archiveSupplierAction(id: string) {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false as const, message: "Ungültige Eingabe." };
  return archiveSupplier(id);
}

export async function cancelWebOrderAction(input: unknown) {
  return cancelWebOrder(input);
}

export async function saveSafetyBufferAction(input: unknown) {
  return saveSafetyBuffer(input);
}
