export interface ShopSyncSettingsValue {
  apiUrl: string;
  deviceId: string;
  deviceKey: string;
}

export function hasShopSyncSettings(settings: ShopSyncSettingsValue): boolean {
  return Boolean(settings.apiUrl && settings.deviceId && settings.deviceKey);
}

/**
 * What the settings page gets: never the device key itself, only whether one
 * is stored (review should #38). The key is the shop backend's bearer token,
 * so it must not end up in the page's HTML/RSC payload.
 */
export interface ShopSyncSettingsView {
  apiUrl: string;
  deviceId: string;
  hasDeviceKey: boolean;
}

export function toShopSyncSettingsView(settings: ShopSyncSettingsValue): ShopSyncSettingsView {
  return { apiUrl: settings.apiUrl, deviceId: settings.deviceId, hasDeviceKey: settings.deviceKey !== "" };
}

/** An empty key field means "keep the stored key" - the form never has the old one to send back. */
export function resolveDeviceKey(submitted: string, stored: string): string {
  return submitted === "" ? stored : submitted;
}

export interface PublishCategoryPayload {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  parentId: string | null;
}

export interface PublishImagePayload {
  id: string;
  type: string;
  r2Key: string;
  width: number;
  height: number;
  sortOrder: number;
  sourceAttribution: string | null;
}

// No `notes` ("Notiz (intern)") and no `stockQty` (no stock tracking in
// Phase 1, and the catalogue serves it publicly): review should #37. The
// backend stores a missing field as NULL, so a row's old values are cleared on
// its next edit (an unchanged updatedAt is skipped as stale).
// build-ops.test.ts pins the exact key list.
export interface PublishProductPayload {
  id: string;
  ean: string | null;
  sku: string;
  nameDe: string;
  nameOriginal: string | null;
  nameEn: string | null;
  brand: string | null;
  originCountry: string | null;
  categoryId: string;
  priceRappen: number;
  vatRate: number;
  unitType: string;
  contentAmount: number | null;
  contentUnit: string | null;
  storageType: string;
  ingredientsDe: string | null;
  allergens: string[];
  nutrition: unknown;
  isAvailable: boolean;
  dataComplete: boolean;
  updatedAt: string;
  images: PublishImagePayload[];
}

export type PublishOp =
  | { op: "upsertCategory"; category: PublishCategoryPayload }
  | { op: "upsert"; product: PublishProductPayload }
  | { op: "delete"; id: string };
