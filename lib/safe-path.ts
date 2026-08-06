import path from "node:path";

/** True, wenn `target` (nach Auflösung von `..`) innerhalb von `root` bleibt. */
export function isPathWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
