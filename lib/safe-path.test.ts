import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinRoot } from "./safe-path";

const root = path.join("C:", "app", "data", "images");

describe("isPathWithinRoot", () => {
  it("accepts a plain file directly under root", () => {
    expect(isPathWithinRoot(root, path.join(root, "ASIA-00001", "front.webp"))).toBe(true);
  });

  it("accepts root itself", () => {
    expect(isPathWithinRoot(root, root)).toBe(true);
  });

  it("rejects a path that escapes root via ..", () => {
    expect(isPathWithinRoot(root, path.join(root, "..", "..", "secret.env"))).toBe(false);
  });

  it("rejects an unrelated absolute path", () => {
    expect(isPathWithinRoot(root, path.join("C:", "Windows", "System32"))).toBe(false);
  });

  it("rejects a sibling directory that merely shares a prefix", () => {
    const sneaky = path.join("C:", "app", "data", "images-evil", "x.webp");
    expect(isPathWithinRoot(root, sneaky)).toBe(false);
  });
});
