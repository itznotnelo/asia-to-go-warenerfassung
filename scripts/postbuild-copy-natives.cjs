// Two Windows-specific problems with `next build`'s standalone output + pnpm:
//
// 1. The symlinks Next/pnpm copy into .next/standalone/node_modules are reparse
//    points that Node's fs.stat/fs.realpath can't traverse on this machine (EPERM),
//    even though fs.lstat/fs.readlink on the same links work fine. So we rebuild
//    the whole tree, resolving every symlink by hand via lstat+readlink instead of
//    stat/realpath, and copy real files in their place.
// 2. sharp's native binary (@img/sharp-*) is resolved dynamically by sharp itself,
//    so Next's static tracer misses it entirely — it has to be added in by hand.
const fs = require("node:fs");
const path = require("node:path");

const standaloneRoot = path.join(__dirname, "..", ".next", "standalone");
const nodeModulesDir = path.join(standaloneRoot, "node_modules");
const fixedDir = path.join(standaloneRoot, "node_modules__fixed");

function resolveSymlinkChain(p) {
  let current = p;
  for (let i = 0; i < 40; i++) {
    const lst = fs.lstatSync(current);
    if (!lst.isSymbolicLink()) return current;
    const target = fs.readlinkSync(current);
    current = path.resolve(path.dirname(current), target);
  }
  throw new Error(`Too many symlink hops resolving ${p}`);
}

function copyDereferenced(src, dest) {
  const real = resolveSymlinkChain(src);
  const lst = fs.lstatSync(real);
  if (lst.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(real)) {
      copyDereferenced(path.join(real, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(real, dest);
  }
}

fs.rmSync(fixedDir, { recursive: true, force: true });
for (const entry of fs.readdirSync(nodeModulesDir)) {
  copyDereferenced(path.join(nodeModulesDir, entry), path.join(fixedDir, entry));
}

function findPackageRoot(fileInPackage, packageName) {
  let dir = path.dirname(fileInPackage);
  while (true) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate, "utf8")).name === packageName) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find package.json for ${packageName}`);
    dir = parent;
  }
}

function findOnDisk(startDir, relPkgPath) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "node_modules", relPkgPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find ${relPkgPath} above ${startDir}`);
    dir = parent;
  }
}

const sharpDir = findPackageRoot(require.resolve("sharp"), "sharp");
copyDereferenced(sharpDir, path.join(fixedDir, "sharp"));
console.log("Added sharp ->", path.join(fixedDir, "sharp"));

const imgPlatformPkg = `@img/sharp-${process.platform}-${process.arch}`;
const imgRoot = findOnDisk(sharpDir, imgPlatformPkg);
const imgDest = path.join(fixedDir, "@img", path.basename(imgRoot));
copyDereferenced(imgRoot, imgDest);
console.log("Added", imgPlatformPkg, "->", imgDest);

fs.rmSync(nodeModulesDir, { recursive: true, force: true });
fs.renameSync(fixedDir, nodeModulesDir);
console.log("Rebuilt", nodeModulesDir, "with real files (no symlinks)");
