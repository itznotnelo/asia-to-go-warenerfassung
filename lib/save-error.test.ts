import { describe, expect, it, vi } from "vitest";
import { SAVE_FAILED, saveErrorLines, settle } from "./save-error";

describe("saveErrorLines", () => {
  it("lists the message, then one German line per rejected field", () => {
    expect(
      saveErrorLines({
        ok: false,
        message: "Bitte Eingaben prüfen.",
        fieldErrors: { originCountry: ["Bitte 2 Buchstaben eingeben, z.B. TH"], priceRappen: ["Preis muss positiv sein"], brand: [] },
      }),
    ).toEqual(["Bitte Eingaben prüfen.", "Herkunftsland: Bitte 2 Buchstaben eingeben, z.B. TH", "Preis: Preis muss positiv sein"]);
  });

  it("does not repeat a field message that equals the main message", () => {
    expect(saveErrorLines({ ok: false, message: "Barcode doppelt", fieldErrors: { ean: ["Barcode doppelt"] } })).toEqual(["Barcode doppelt"]);
  });
});

describe("settle", () => {
  it("passes a normal result through", async () => {
    await expect(settle(async () => ({ ok: true as const, id: "p1" }))).resolves.toEqual({ ok: true, id: "p1" });
  });

  it("turns a thrown server action into a visible failure instead of rejecting", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      settle(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      }),
    ).resolves.toEqual({ ok: false, message: SAVE_FAILED });
    spy.mockRestore();
  });
});
