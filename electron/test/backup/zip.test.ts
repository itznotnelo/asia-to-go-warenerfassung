import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { crc32, extractZip, listFilesRecursive, readZipEntries, testZip, writeZip } from "../../src/backup/zip";
import { makeTempUserData, writeImages } from "./fakes";

const dirs: string[] = [];
function tmp(): string {
  const d = makeTempUserData();
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("store-only zip", () => {
  it("crc32 matches the reference value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips nested files incl. non-ASCII names", async () => {
    const d = tmp();
    const src = path.join(d, "images");
    writeImages(src, { "p1/a.jpg": "aaa", "p2/辛拉面.webp": Buffer.alloc(5000, 7).toString("binary") });
    const zip = path.join(d, "images.zip");
    expect(await writeZip(src, zip)).toBe(2);
    expect((await readZipEntries(zip)).map((e) => e.name)).toEqual(["p1/a.jpg", "p2/辛拉面.webp"]);
    expect(await testZip(zip)).toBe(2);
    const out = path.join(d, "out");
    expect(await extractZip(zip, out)).toBe(2);
    expect(listFilesRecursive(out)).toEqual(["p1/a.jpg", "p2/辛拉面.webp"]);
    expect(fs.readFileSync(path.join(out, "p1", "a.jpg"), "utf8")).toBe("aaa");
  });

  it("missing images folder gives a valid empty zip", async () => {
    const d = tmp();
    const zip = path.join(d, "images.zip");
    expect(await writeZip(path.join(d, "nope"), zip)).toBe(0);
    expect(await testZip(zip)).toBe(0);
  });

  it("detects bit rot and truncation", async () => {
    const d = tmp();
    writeImages(path.join(d, "images"), { "a.jpg": "a".repeat(1000), "b.jpg": "b".repeat(1000) });
    const zip = path.join(d, "images.zip");
    await writeZip(path.join(d, "images"), zip);
    const buf = fs.readFileSync(zip);

    const flipped = Buffer.from(buf);
    flipped[100] ^= 0xff;
    fs.writeFileSync(path.join(d, "flip.zip"), flipped);
    await expect(testZip(path.join(d, "flip.zip"))).rejects.toThrow(/checksum/);

    fs.writeFileSync(path.join(d, "trunc.zip"), buf.subarray(0, Math.floor(buf.length / 2)));
    await expect(testZip(path.join(d, "trunc.zip"))).rejects.toThrow();
  });
});
