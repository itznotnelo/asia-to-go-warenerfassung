import { describe, expect, it } from "vitest";
import type { BackupListEntry } from "../src/backup/store";
import type { Manifest, Pool } from "../src/backup/types";
import { buildRestoreChoices, preselectedChoice } from "../src/restore-choices";

function manifest(kind: Pool, products: number, images: number, verified = true): Manifest {
  return {
    kind,
    createdAt: "2026-10-30T01:15:00.000Z",
    appVersion: "1.2.0",
    serverVersion: "18.4",
    serverEncoding: "UTF8",
    datcollate: "C",
    lastMigration: null,
    migrations: [],
    rowCounts: { Product: products, ProductImage: images },
    imageCount: images,
    files: { "db.dump": { bytes: 1, sha256: "a" }, "images.zip": { bytes: 1, sha256: "b" } },
    verified: { pgRestoreList: verified, pgRestoreFullRead: verified, zipTest: verified },
  };
}

function entry(pool: Pool, name: string, root: string, m: Manifest | null): BackupListEntry {
  return { pool, name, dir: `${root}/${pool}/${name}`, manifest: m };
}

describe("buildRestoreChoices", () => {
  it("merges local and copy newest first, a backup in both places once as local", () => {
    const local = [
      entry("manual", "2026-10-30_140300_v1.2.0", "/pc", manifest("manual", 418, 534)),
      entry("daily", "2026-10-30_021500_v1.2.0", "/pc", manifest("daily", 412, 530)),
    ];
    const copy = [
      entry("daily", "2026-10-30_021500_v1.2.0", "/usb", manifest("daily", 412, 530)),
      entry("daily", "2026-10-27_021000_v1.2.0", "/usb", manifest("daily", 398, 515)),
    ];
    const { choices, dirs } = buildRestoreChoices(local, copy);
    expect(choices.map((c) => [c.name, c.location])).toEqual([
      ["2026-10-30_140300_v1.2.0", "local"],
      ["2026-10-30_021500_v1.2.0", "local"],
      ["2026-10-27_021000_v1.2.0", "copy"],
    ]);
    expect(choices[0]).toMatchObject({ pool: "manual", products: 418, images: 534, damaged: false });
    expect(dirs.get(choices[1].id)).toBe("/pc/daily/2026-10-30_021500_v1.2.0");
    expect(dirs.get(choices[2].id)).toBe("/usb/daily/2026-10-27_021000_v1.2.0");
  });

  it("marks missing manifests and unverified backups as damaged", () => {
    const { choices } = buildRestoreChoices(
      [
        entry("daily", "2026-10-30_021500_v1", "/pc", null),
        entry("daily", "2026-10-29_021500_v1", "/pc", manifest("daily", 1, 1, false)),
      ],
      [],
    );
    expect(choices.map((c) => c.damaged)).toEqual([true, true]);
    expect(choices[0]).toMatchObject({ createdAt: null, products: null, images: null });
  });
});

describe("preselectedChoice", () => {
  const { choices } = buildRestoreChoices(
    [
      entry("daily", "2026-10-30_021500_v1", "/pc", null),
      entry("daily", "2026-10-29_021500_v1", "/pc", manifest("daily", 1, 1)),
      entry("pre-migrate", "2026-10-28_075800_v1", "/pc", manifest("pre-migrate", 1, 1)),
    ],
    [],
  );

  it("skips damaged rows", () => {
    expect(preselectedChoice(choices)).toBe("local:daily/2026-10-29_021500_v1");
  });

  it("prefers the newest Vor Update backup when asked", () => {
    expect(preselectedChoice(choices, true)).toBe("local:pre-migrate/2026-10-28_075800_v1");
  });

  it("is null when nothing is restorable", () => {
    expect(preselectedChoice([])).toBeNull();
  });
});
