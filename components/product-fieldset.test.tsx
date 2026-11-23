// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CategoryOption } from "@/lib/category-option";
import { EMPTY_VALUES, type FormValues } from "@/app/scan/product-form-helpers";
import { ProductFieldset } from "./product-fieldset";

afterEach(cleanup);

const categories: CategoryOption[] = [
  { id: "c-reis", name: "Reis", parentName: "Nudeln & Reis", slug: "reis", parentSlug: "nudeln-reis" },
  { id: "c-alk", name: "Alkohol", parentName: "Getränke", slug: "alkohol", parentSlug: "getraenke" },
];

function Harness({ initial, vatTouchedInitially, sourced }: { initial: Partial<FormValues>; vatTouchedInitially?: boolean; sourced?: Set<keyof FormValues> }) {
  const [values, setValues] = useState<FormValues>({ ...EMPTY_VALUES, ...initial });
  return (
    <ProductFieldset
      formId="t"
      values={values}
      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
      categories={categories}
      autoFocusName={false}
      vatTouchedInitially={vatTouchedInitially}
      sourced={sourced}
    />
  );
}

const vatSelect = () => document.getElementById("t-vat") as HTMLSelectElement;
const categorySelect = () => document.getElementById("t-category") as HTMLSelectElement;
const originSelect = () => document.getElementById("t-origin") as HTMLSelectElement;

describe("ProductFieldset MwSt (#33)", () => {
  it("on a new product, follows the category", () => {
    render(<Harness initial={{}} />);
    fireEvent.change(categorySelect(), { target: { value: "c-alk" } });
    expect(vatSelect().value).toBe("8.1");
  });

  it("on the edit page, keeps a stored 8.1% when the category changes and offers the suggestion", () => {
    render(<Harness initial={{ categoryId: "c-alk", vatRate: 8.1 }} vatTouchedInitially />);
    fireEvent.change(categorySelect(), { target: { value: "c-reis" } });
    expect(vatSelect().value).toBe("8.1");
    expect(screen.getByText(/Vorschlag für diese Kategorie: 2.6 %/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(vatSelect().value).toBe("2.6");
    expect(screen.queryByText(/Vorschlag für diese Kategorie/)).toBeNull();
  });

  it("stops following the category once the rate is picked by hand", () => {
    render(<Harness initial={{}} />);
    fireEvent.change(categorySelect(), { target: { value: "c-reis" } });
    fireEvent.change(vatSelect(), { target: { value: "8.1" } });
    fireEvent.change(categorySelect(), { target: { value: "c-alk" } });
    fireEvent.change(categorySelect(), { target: { value: "c-reis" } });
    expect(vatSelect().value).toBe("8.1");
  });
});

describe("ProductFieldset Herkunftsland (#39)", () => {
  it("is a dropdown with German names, common origins first", () => {
    render(<Harness initial={{}} />);
    const select = originSelect();
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByText("Herkunftsland")).toBeTruthy();
    expect(select.options[0].textContent).toBe("Nicht angegeben");
    expect(select.options[1].value).toBe("TH");
    expect(select.options[1].textContent).toBe("Thailand");
    const groups = Array.from(select.querySelectorAll("optgroup")).map((g) => g.label);
    expect(groups).toEqual(["Häufig", "Alle Länder"]);
  });

  it("stores the ISO code when a country is picked by name", () => {
    render(<Harness initial={{}} />);
    fireEvent.change(originSelect(), { target: { value: "KR" } });
    expect(originSelect().value).toBe("KR");
    expect(originSelect().selectedOptions[0].textContent).toBe("Südkorea");
  });

  it("keeps an old free-text value visible instead of dropping it", () => {
    render(<Harness initial={{ originCountry: "XX" }} />);
    expect(originSelect().value).toBe("XX");
    expect(originSelect().selectedOptions[0].textContent).toBe("XX (bitte prüfen)");
  });

  it("marks fields from the online search with 'online', not 'OFF'", () => {
    render(<Harness initial={{ originCountry: "TH" }} sourced={new Set<keyof FormValues>(["originCountry"])} />);
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.queryByText("OFF")).toBeNull();
  });
});
