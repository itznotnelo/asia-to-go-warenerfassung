// Renders build/icon.svg into build/icon.ico (Windows, multi-resolution) and
// app/favicon.ico (Next.js web favicon) via sharp, which is already a
// project dependency. ICO files can embed plain PNG frames per-size since
// Windows Vista, which sidesteps writing a BMP/DIB encoder by hand.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "build", "icon.svg");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(buffer.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // offset
    offset += buffer.length;
    dirEntries.push(entry);
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buffer)]);
}

async function main() {
  const svg = fs.readFileSync(svgPath);

  const pngBuffers = await Promise.all(
    sizes.map(async (size) => ({
      size,
      buffer: await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer(),
    })),
  );

  const icoPath = path.join(root, "build", "icon.ico");
  fs.writeFileSync(icoPath, buildIco(pngBuffers));
  console.log(`Wrote ${icoPath}`);

  // Next.js picks up app/favicon.ico by convention; reuse the 32/48/16 set.
  const faviconBuffers = pngBuffers.filter((p) => [16, 32, 48].includes(p.size));
  const faviconPath = path.join(root, "app", "favicon.ico");
  fs.writeFileSync(faviconPath, buildIco(faviconBuffers));
  console.log(`Wrote ${faviconPath}`);

  // Also drop a 512px PNG for use as a source elsewhere (README, store listing, etc).
  const pngPath = path.join(root, "build", "icon.png");
  fs.writeFileSync(pngPath, await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer());
  console.log(`Wrote ${pngPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
