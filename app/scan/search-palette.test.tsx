// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductSummary } from "@/lib/product-summary";

const hits = [
  { id: "p1", nameDe: "Jasminreis", sku: "ATG-0001", priceRappen: 450 },
  { id: "p2", nameDe: "Sojasauce", sku: "ATG-0002", priceRappen: 390 },
  { id: "p3", nameDe: "Reisnudeln", sku: "ATG-0003", priceRappen: 280 },
] as unknown as ProductSummary[];

vi.mock("./actions", () => ({
  searchProducts: vi.fn(async () => hits),
}));

const { SearchPalette } = await import("./search-palette");

afterEach(cleanup);

async function setup() {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<SearchPalette onSelect={onSelect} onClose={onClose} />);
  await screen.findByText("Jasminreis");
  const input = screen.getByRole("combobox");
  return { onSelect, onClose, input };
}

function activeName() {
  return screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")?.textContent;
}

describe("SearchPalette keyboard", () => {
  it("highlights the first hit and opens it on Enter", async () => {
    const { onSelect, input } = await setup();
    expect(activeName()).toContain("Jasminreis");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(hits[0]);
  });

  it("moves the highlight with ArrowDown/ArrowUp and opens the highlighted hit", async () => {
    const { onSelect, input } = await setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeName()).toContain("Reisnudeln");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeName()).toContain("Sojasauce");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(hits[1]);
  });

  it("stops at both ends of the list", async () => {
    const { input } = await setup();
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeName()).toContain("Jasminreis");
    for (let i = 0; i < 5; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeName()).toContain("Reisnudeln");
  });

  it("still opens a hit on click and closes on Escape", async () => {
    const { onSelect, onClose, input } = await setup();
    fireEvent.click(screen.getByText("Reisnudeln"));
    expect(onSelect).toHaveBeenCalledWith(hits[2]);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
