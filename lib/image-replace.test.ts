import { describe, expect, it } from "vitest";
import { imagesReplacedBy } from "./image-replace";

const existing = [
  { id: "a", type: "front" as const },
  { id: "b", type: "ingredients" as const },
  { id: "c", type: "front" as const },
  { id: "d", type: "other" as const },
];

describe("imagesReplacedBy", () => {
  it("replaces every older photo of the same single-slot type", () => {
    expect(imagesReplacedBy(existing, "front").map((image) => image.id)).toEqual(["a", "c"]);
    expect(imagesReplacedBy(existing, "ingredients").map((image) => image.id)).toEqual(["b"]);
  });

  it("replaces nothing when the slot is still empty", () => {
    expect(imagesReplacedBy(existing, "nutrition")).toEqual([]);
  });

  it("never replaces for Weitere: those photos add up", () => {
    expect(imagesReplacedBy(existing, "other")).toEqual([]);
  });
});
