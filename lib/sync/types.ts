export interface ShopSyncSettingsValue {
  apiUrl: string;
  deviceId: string;
  deviceKey: string;
}

export function hasShopSyncSettings(settings: ShopSyncSettingsValue): boolean {
  return Boolean(settings.apiUrl && settings.deviceId && settings.deviceKey);
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
  stockQty: number | null;
  dataComplete: boolean;
  notes: string | null;
  updatedAt: string;
  images: PublishImagePayload[];
}

export type PublishOp =
  | { op: "upsertCategory"; category: PublishCategoryPayload }
  | { op: "upsert"; product: PublishProductPayload }
  | { op: "delete"; id: string };

export interface PendingOrderItem {
  productId: string | null;
  nameDe: string;
  qty: number;
}

export interface PendingOrder {
  id: string;
  customerName: string;
  customerPhone: string | null;
  fulfilmentType: string;
  totalRappen: number;
  notes: string | null;
  createdAt: string;
  items: PendingOrderItem[];
}
