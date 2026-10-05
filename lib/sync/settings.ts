import "server-only";
import { prisma } from "@/lib/prisma";
import type { ShopSyncSettingsValue } from "./types";

const SETTINGS_ID = 1;

export async function getShopSyncSettings(): Promise<ShopSyncSettingsValue> {
  const row = await prisma.shopSyncSettings.findUnique({ where: { id: SETTINGS_ID } });
  return { apiUrl: row?.apiUrl ?? "", deviceId: row?.deviceId ?? "", deviceKey: row?.deviceKey ?? "" };
}

export async function saveShopSyncSettings(value: ShopSyncSettingsValue): Promise<void> {
  await prisma.shopSyncSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, apiUrl: value.apiUrl, deviceId: value.deviceId, deviceKey: value.deviceKey },
    update: { apiUrl: value.apiUrl, deviceId: value.deviceId, deviceKey: value.deviceKey },
  });
}
