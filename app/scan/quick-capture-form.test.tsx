// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoryOption } from "@/lib/category-option";
import { QuickCaptureForm } from "./quick-capture-form";

afterEach(cleanup);

const categories: CategoryOption[] = [
  { id: "c-reis", name: "Reis", parentName: "Nudeln & Reis", slug: "reis", parentSlug: "nudeln-reis" },
  { id: "c-alk", name: "Alkohol", parentName: "Getränke", slug: "alkohol", parentSlug: "getraenke" },
  { id: "c-kos", name: "Kosmetik & Körperpflege", parentName: "Non-Food", slug: "kosmetik-koerperpflege", parentSlug: "non-food" },
];

function setup() {
  const onSave = vi.fn();
  render(
    <QuickCaptureForm
      ean="4006381333931"
      categories={categories}
      dataSource="manual"
      onSave={onSave}
      onCancel={() => {}}
      saving={false}
      saveError={null}
    />,
  );
  const vat = screen.getByLabelText("MwSt-Satz") as HTMLSelectElement;
  const category = screen.getByLabelText("Kategorie") as HTMLSelectElement;
  return { onSave, vat, category };
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Name (Deutsch)"), { target: { value: "Testartikel" } });
  fireEvent.change(screen.getByLabelText("Preis (CHF)"), { target: { value: "4.50" } });
  fireEvent.click(screen.getByRole("button", { name: "Schnell speichern" }));
}

describe("QuickCaptureForm MwSt", () => {
  it("shows the rate on screen, with the reason in the option label", () => {
    const { vat } = setup();
    expect(vat.value).toBe("2.6");
    expect(vat.selectedOptions[0].textContent).toBe("2.6 % (Lebensmittel)");
  });

  it("follows the category until the rate is picked by hand", () => {
    const { vat, category } = setup();
    fireEvent.change(category, { target: { value: "c-kos" } });
    expect(vat.value).toBe("8.1");
    fireEvent.change(category, { target: { value: "c-reis" } });
    expect(vat.value).toBe("2.6");
  });

  it("keeps a hand-picked rate when the category changes afterwards (vatTouched)", () => {
    const { vat, category } = setup();
    fireEvent.change(category, { target: { value: "c-reis" } });
    fireEvent.change(vat, { target: { value: "8.1" } });
    fireEvent.change(category, { target: { value: "c-alk" } });
    fireEvent.change(category, { target: { value: "c-reis" } });
    expect(vat.value).toBe("8.1");
  });

  it("saves exactly the rate that was on screen", () => {
    const { onSave, vat, category } = setup();
    fireEvent.change(category, { target: { value: "c-reis" } });
    fireEvent.change(vat, { target: { value: "8.1" } });
    fillAndSubmit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ categoryId: "c-reis", vatRate: 8.1, priceRappen: 450 });
  });
});
