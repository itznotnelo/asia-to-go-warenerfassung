import { describe, expect, it } from "vitest";
import { canUndoType, checkMovementQuantity, MOVEMENT_TYPES, movementTypeLabel } from "./movement-rules";

describe("checkMovementQuantity", () => {
  it("lets receipts only add and sales, waste, returns only remove", () => {
    expect(checkMovementQuantity("receipt", 5)).toBeNull();
    expect(checkMovementQuantity("receipt", -5)).toMatch(/positiv/);
    for (const type of ["sale_shop", "sale_web", "waste", "return_to_supplier"] as const) {
      expect(checkMovementQuantity(type, -1)).toBeNull();
      expect(checkMovementQuantity(type, 1)).toMatch(/negativ/);
    }
  });
  it("lets corrections and manual bookings go both ways", () => {
    expect(checkMovementQuantity("count_correction", -4)).toBeNull();
    expect(checkMovementQuantity("manual", 4)).toBeNull();
  });
  it("rejects 0 and fractions, even for reversals", () => {
    expect(checkMovementQuantity("manual", 0)).toMatch(/0/);
    expect(checkMovementQuantity("manual", 1.5)).toMatch(/ganze/);
    expect(checkMovementQuantity("receipt", 0, true)).not.toBeNull();
  });
  it("exempts reversals from the sign rule", () => {
    expect(checkMovementQuantity("receipt", -5, true)).toBeNull();
    expect(checkMovementQuantity("sale_shop", 1, true)).toBeNull();
  });
});

describe("labels and undo", () => {
  it("has a German label for every type", () => {
    for (const type of MOVEMENT_TYPES) expect(movementTypeLabel(type)).toMatch(/^[A-ZÄÖÜ]/);
  });
  it("never undoes a web sale (cancel the order instead)", () => {
    expect(canUndoType("sale_web")).toBe(false);
    expect(canUndoType("sale_shop")).toBe(true);
  });
});
