import { beforeEach, describe, expect, it, vi } from "vitest";

// Review should #34: soft delete, restore and the final purge, each with its
// outbox write inside the same $transaction as the product change.

const txMock = {
  product: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};
const prismaMock = {
  $transaction: vi.fn(async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("server-only", () => ({}));

const enqueueProductSyncMock = vi.fn();
const enqueueProductDeleteSyncMock = vi.fn();
vi.mock("@/lib/sync/outbox", () => ({
  enqueueProductSync: enqueueProductSyncMock,
  enqueueProductDeleteSync: enqueueProductDeleteSyncMock,
}));
const removeProductImageDirMock = vi.fn();
vi.mock("@/lib/images", () => ({ removeProductImageDir: removeProductImageDirMock }));
const triggerBackgroundDrainMock = vi.fn();
vi.mock("@/lib/sync/runner", () => ({ triggerBackgroundDrain: triggerBackgroundDrainMock }));

const {
  archiveProduct,
  restoreArchivedProduct,
  purgeArchivedProduct,
  ARCHIVE_NOT_FOUND,
  PURGE_NOT_ARCHIVED,
  PURGE_TOO_EARLY,
} = await import("./product-archive");
const { SHOP_DELETE_GRACE_MS } = await import("./archive-grace");

const NOW = new Date("2026-10-30T16:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

beforeEach(() => {
  txMock.product.findUnique.mockReset();
  txMock.product.update.mockReset().mockResolvedValue({});
  txMock.product.delete.mockReset().mockResolvedValue({});
  prismaMock.$transaction.mockClear();
  enqueueProductSyncMock.mockReset().mockResolvedValue(undefined);
  enqueueProductDeleteSyncMock.mockReset().mockResolvedValue(undefined);
  removeProductImageDirMock.mockReset().mockResolvedValue(undefined);
  triggerBackgroundDrainMock.mockReset();
});

describe("archiveProduct", () => {
  it("sets archivedAt and queues the shop sync in the same transaction, never hard-deletes", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null });

    const result = await archiveProduct("prod_1", NOW);

    expect(result).toEqual({ ok: true });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.product.update).toHaveBeenCalledWith({ where: { id: "prod_1" }, data: { archivedAt: NOW } });
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("prod_1", txMock);
    expect(txMock.product.delete).not.toHaveBeenCalled();
    expect(removeProductImageDirMock).not.toHaveBeenCalled();
  });

  it("writes archivedAt before the outbox reads the row back", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null });

    await archiveProduct("prod_1", NOW);

    expect(txMock.product.update.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueProductSyncMock.mock.invocationCallOrder[0],
    );
  });

  it("does not trigger an immediate drain (the delete is held for the grace period anyway)", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null });

    await archiveProduct("prod_1", NOW);

    expect(triggerBackgroundDrainMock).not.toHaveBeenCalled();
  });

  it("keeps the first archivedAt on a second click, so the shop delete is not pushed further out", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(2) });

    const result = await archiveProduct("prod_1", NOW);

    expect(result).toEqual({ ok: true });
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("prod_1", txMock);
  });

  it("reports a missing article and queues nothing", async () => {
    txMock.product.findUnique.mockResolvedValue(null);

    expect(await archiveProduct("prod_missing", NOW)).toEqual({ ok: false, message: ARCHIVE_NOT_FOUND });
    expect(enqueueProductSyncMock).not.toHaveBeenCalled();
  });

  it("lets an outbox failure fail the whole archive (the transaction rolls archivedAt back)", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null });
    enqueueProductSyncMock.mockRejectedValue(new Error("db down"));

    await expect(archiveProduct("prod_1", NOW)).rejects.toThrow("db down");
  });
});

describe("restoreArchivedProduct", () => {
  it("clears archivedAt, re-queues the current state in the same transaction, then drains", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(1) });

    const result = await restoreArchivedProduct("prod_1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.product.update).toHaveBeenCalledWith({ where: { id: "prod_1" }, data: { archivedAt: null } });
    expect(enqueueProductSyncMock).toHaveBeenCalledWith("prod_1", txMock);
    expect(txMock.product.update.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueProductSyncMock.mock.invocationCallOrder[0],
    );
    expect(triggerBackgroundDrainMock).toHaveBeenCalledTimes(1);
  });

  it("touches nothing but archivedAt (isAvailable, price etc. stay as they were)", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(1) });

    await restoreArchivedProduct("prod_1");

    expect(Object.keys(txMock.product.update.mock.calls[0][0].data)).toEqual(["archivedAt"]);
  });

  it("is a harmless no-op update for an article that is not archived", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null });

    expect(await restoreArchivedProduct("prod_1")).toEqual({ ok: true });
    expect(txMock.product.update).not.toHaveBeenCalled();
  });

  it("reports a missing article (e.g. purged meanwhile)", async () => {
    txMock.product.findUnique.mockResolvedValue(null);

    expect(await restoreArchivedProduct("prod_1")).toEqual({ ok: false, message: ARCHIVE_NOT_FOUND });
    expect(triggerBackgroundDrainMock).not.toHaveBeenCalled();
  });
});

describe("purgeArchivedProduct", () => {
  const graceMinutes = SHOP_DELETE_GRACE_MS / 60_000;

  it("hard-deletes an archived article after the grace period, with a delete op in the same transaction", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(graceMinutes + 1), sku: "ASIA-00042" });

    const result = await purgeArchivedProduct("prod_1", NOW);

    expect(result).toEqual({ ok: true });
    expect(enqueueProductDeleteSyncMock).toHaveBeenCalledWith("prod_1", txMock);
    expect(txMock.product.delete).toHaveBeenCalledWith({ where: { id: "prod_1" } });
    expect(triggerBackgroundDrainMock).toHaveBeenCalledTimes(1);
  });

  it("removes the image folder only after the commit (#3135 moved here from Löschen)", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(graceMinutes), sku: "ASIA-00042" });

    await purgeArchivedProduct("prod_1", NOW);

    expect(removeProductImageDirMock).toHaveBeenCalledWith("ASIA-00042");
    expect(prismaMock.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      removeProductImageDirMock.mock.invocationCallOrder[0],
    );
  });

  it("keeps the images when the delete fails", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(graceMinutes + 1), sku: "ASIA-00042" });
    txMock.product.delete.mockRejectedValue(new Error("db down"));

    await expect(purgeArchivedProduct("prod_1", NOW)).rejects.toThrow("db down");
    expect(removeProductImageDirMock).not.toHaveBeenCalled();
  });

  it("refuses an active article: Endgültig löschen is only the second step", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: null, sku: "ASIA-00042" });

    expect(await purgeArchivedProduct("prod_1", NOW)).toEqual({ ok: false, message: PURGE_NOT_ARCHIVED });
    expect(txMock.product.delete).not.toHaveBeenCalled();
    expect(enqueueProductDeleteSyncMock).not.toHaveBeenCalled();
    expect(removeProductImageDirMock).not.toHaveBeenCalled();
  });

  it("refuses while the grace period is still running", async () => {
    txMock.product.findUnique.mockResolvedValue({ archivedAt: minutesAgo(graceMinutes - 1), sku: "ASIA-00042" });

    expect(await purgeArchivedProduct("prod_1", NOW)).toEqual({ ok: false, message: PURGE_TOO_EARLY });
    expect(txMock.product.delete).not.toHaveBeenCalled();
    expect(removeProductImageDirMock).not.toHaveBeenCalled();
  });

  it("reports a missing article", async () => {
    txMock.product.findUnique.mockResolvedValue(null);

    expect(await purgeArchivedProduct("prod_1", NOW)).toEqual({ ok: false, message: ARCHIVE_NOT_FOUND });
  });
});
