import { describe, expect, it } from "vitest";
import { nextActionLabel, statusLabel } from "./order-labels";

describe("order status labels", () => {
  it("says Bereitgestellt instead of the warehouse word Gepickt", () => {
    expect(statusLabel("picked", "pickup")).toBe("Bereitgestellt");
  });

  it("names the ready state by how the order leaves the shop", () => {
    expect(statusLabel("ready", "pickup")).toBe("Abholbereit");
    expect(statusLabel("ready", "delivery")).toBe("Lieferbereit");
  });

  it("labels the closed states from the copy sheet (#3065 #36)", () => {
    expect(statusLabel("collected", "pickup")).toBe("Abgeholt");
    expect(statusLabel("collected", "delivery")).toBe("Geliefert");
    expect(statusLabel("cancelled", "delivery")).toBe("Storniert");
    expect(nextActionLabel("collected", "pickup")).toBeNull();
    expect(nextActionLabel("cancelled", "pickup")).toBeNull();
  });

  it("labels each button with the state it moves to", () => {
    expect(nextActionLabel("received", "pickup")).toBe("Bereitgestellt");
    expect(nextActionLabel("picked", "delivery")).toBe("Lieferbereit");
    expect(nextActionLabel("ready", "pickup")).toBeNull();
  });
});
