// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShopReadinessBox } from "./shop-readiness-box";

afterEach(cleanup);

describe("ShopReadinessBox", () => {
  it("lists what is missing in plain words", () => {
    render(<ShopReadinessBox missing={["image", "allergens"]} isAvailable archived={false} />);
    expect(screen.getByText("Noch nicht im Webshop")).toBeTruthy();
    expect(screen.getByText("Foto")).toBeTruthy();
    expect(screen.getByText("Allergene prüfen")).toBeTruthy();
  });

  it("says when the article is in the shop and offers the next one from the queue", () => {
    render(<ShopReadinessBox missing={[]} isAvailable archived={false} nextIncomplete={{ id: "p2", nameDe: "Kimchi" }} />);
    expect(screen.getByText("Im Webshop sichtbar")).toBeTruthy();
    const next = screen.getByRole("link", { name: "Weiter mit: Kimchi" });
    expect(next.getAttribute("href")).toBe("/products/p2");
  });

  it("does not offer the next article while this one is unfinished", () => {
    render(<ShopReadinessBox missing={["image"]} isAvailable archived={false} nextIncomplete={{ id: "p2", nameDe: "Kimchi" }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("explains a complete article that is switched off", () => {
    render(<ShopReadinessBox missing={[]} isAvailable={false} archived={false} />);
    expect(screen.getByText("Vollständig, aber als nicht verfügbar markiert")).toBeTruthy();
  });

  it("stays silent for a deleted article (its own panel explains that)", () => {
    const { container } = render(<ShopReadinessBox missing={["image"]} isAvailable archived />);
    expect(container.innerHTML).toBe("");
  });

  it("tells a tracked article without enough stock to receive or correct stock, not to tick a box", () => {
    render(<ShopReadinessBox missing={[]} isAvailable={false} archived={false} stockTracked />);
    expect(screen.getByText(/Zu wenig Bestand/)).toBeTruthy();
    expect(screen.queryByText(/ankreuzen/)).toBeNull();
  });
});
