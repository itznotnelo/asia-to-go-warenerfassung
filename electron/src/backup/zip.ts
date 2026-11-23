import fs from "node:fs";
import path from "node:path";

// Minimal store-only ZIP writer/reader for images.zip. Product images are
// already compressed (JPEG/WebP), so deflate would only cost time, and this
// avoids a new runtime dependency in electron/app. No ZIP64: a backup over
// 4 GiB or 65535 files is refused (the shop has ~500 images).

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const MAX_U32 = 0xffffffff;
const UTF8_FLAG = 0x0800;

export interface ZipEntry {
  name: string;
  size: number;
  crc: number;
  localHeaderOffset: number;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Relative paths ("a/b.jpg") of all regular files under dir, sorted.
export function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(childRel);
      else if (ent.isFile()) out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

// Zips every file under srcDir (missing dir = empty zip). Returns the entry count.
export async function writeZip(srcDir: string, outFile: string): Promise<number> {
  const files = listFilesRecursive(srcDir);
  if (files.length > 0xffff) throw new Error(`too many files for zip: ${files.length}`);
  const handle = await fs.promises.open(outFile, "wx");
  const central: Buffer[] = [];
  let offset = 0;
  try {
    for (const rel of files) {
      const abs = path.join(srcDir, ...rel.split("/"));
      const data = await fs.promises.readFile(abs);
      const mtime = (await fs.promises.stat(abs)).mtime;
      const name = Buffer.from(rel, "utf8");
      const crc = crc32(data);
      const { time, date } = dosDateTime(mtime);
      if (offset + 30 + name.length + data.length > MAX_U32) throw new Error("images.zip would exceed 4 GiB");

      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(10, 4); // version needed
      local.writeUInt16LE(UTF8_FLAG, 6);
      local.writeUInt16LE(0, 8); // method: store
      local.writeUInt16LE(time, 10);
      local.writeUInt16LE(date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      await handle.write(local);
      await handle.write(name);
      await handle.write(data);

      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4); // version made by
      cd.writeUInt16LE(10, 6);
      cd.writeUInt16LE(UTF8_FLAG, 8);
      cd.writeUInt16LE(0, 10);
      cd.writeUInt16LE(time, 12);
      cd.writeUInt16LE(date, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(data.length, 20);
      cd.writeUInt32LE(data.length, 24);
      cd.writeUInt16LE(name.length, 28);
      cd.writeUInt32LE(offset, 42);
      central.push(cd, name);

      offset += 30 + name.length + data.length;
    }
    const cdBuf = Buffer.concat(central);
    if (offset + cdBuf.length > MAX_U32) throw new Error("images.zip would exceed 4 GiB");
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    await handle.write(cdBuf);
    await handle.write(eocd);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return files.length;
}

// Parses the central directory (design 2.2 step 4). Throws on a damaged file.
export async function readZipEntries(file: string): Promise<ZipEntry[]> {
  const handle = await fs.promises.open(file, "r");
  try {
    const { size } = await handle.stat();
    if (size < 22) throw new Error("zip too small");
    const tailLen = Math.min(size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLen);
    await handle.read(tail, 0, tailLen, size - tailLen);
    let eocdAt = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocdAt = i;
        break;
      }
    }
    if (eocdAt < 0) throw new Error("zip end record not found");
    const count = tail.readUInt16LE(eocdAt + 10);
    const cdSize = tail.readUInt32LE(eocdAt + 12);
    const cdOffset = tail.readUInt32LE(eocdAt + 16);
    if (cdOffset + cdSize > size) throw new Error("zip central directory out of range");
    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);

    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error("zip central directory damaged");
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      entries.push({
        crc: cd.readUInt32LE(p + 16),
        size: cd.readUInt32LE(p + 24),
        name: cd.toString("utf8", p + 46, p + 46 + nameLen),
        localHeaderOffset: cd.readUInt32LE(p + 42),
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally {
    await handle.close();
  }
}

async function readEntryData(handle: fs.promises.FileHandle, entry: ZipEntry): Promise<Buffer> {
  const header = Buffer.alloc(30);
  await handle.read(header, 0, 30, entry.localHeaderOffset);
  if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`zip local header damaged: ${entry.name}`);
  if (header.readUInt16LE(8) !== 0) throw new Error(`zip entry not stored: ${entry.name}`);
  const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = Buffer.alloc(entry.size);
  const { bytesRead } = await handle.read(data, 0, entry.size, start);
  if (bytesRead !== entry.size) throw new Error(`zip entry truncated: ${entry.name}`);
  if (crc32(data) !== entry.crc) throw new Error(`zip entry checksum mismatch: ${entry.name}`);
  return data;
}

function safeEntryPath(destDir: string, name: string): string {
  const parts = name.split("/");
  if (name.startsWith("/") || parts.some((p) => p === ".." || p === "" || p.includes("\\") || p.includes(":"))) {
    throw new Error(`unsafe zip entry name: ${name}`);
  }
  return path.join(destDir, ...parts);
}

// Reads every entry and checks its CRC. Returns the entry count.
export async function testZip(file: string): Promise<number> {
  const entries = await readZipEntries(file);
  const handle = await fs.promises.open(file, "r");
  try {
    for (const e of entries) await readEntryData(handle, e);
  } finally {
    await handle.close();
  }
  return entries.length;
}

// Extracts into destDir (must not exist yet). Returns the entry count.
export async function extractZip(file: string, destDir: string): Promise<number> {
  const entries = await readZipEntries(file);
  await fs.promises.mkdir(destDir);
  const handle = await fs.promises.open(file, "r");
  try {
    for (const e of entries) {
      const target = safeEntryPath(destDir, e.name);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, await readEntryData(handle, e));
    }
  } finally {
    await handle.close();
  }
  return entries.length;
}
