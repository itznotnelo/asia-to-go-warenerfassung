// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scan-feedback", () => ({
  playScanSuccess: vi.fn(),
  playScanError: vi.fn(),
}));

const { playScanError, playScanSuccess } = await import("@/lib/scan-feedback");
const { isEditableTarget, useBarcodeScanner } = await import("./use-barcode-scanner");

const VALID_EAN13 = "3017620422003"; // Nutella, echter Barcode
const INVALID_EAN13 = "3017620422007"; // Prüfziffer bewusst kaputt

/** Simuliert einen Scanner: jedes Zeichen mit `gapMs` Abstand, dann Enter. */
function typeAsScanner(text: string, gapMs = 5) {
  let now = 1000;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

  for (const char of text) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    now += gapMs;
  }
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

  nowSpy.mockRestore();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("isEditableTarget", () => {
  it("recognizes inputs, textareas and contentEditable elements", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const div = document.createElement("div");
    const editableDiv = document.createElement("div");
    Object.defineProperty(editableDiv, "isContentEditable", { value: true });

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(editableDiv)).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("useBarcodeScanner", () => {
  it("recognizes a fast, valid scan and plays the success tone", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    typeAsScanner(VALID_EAN13, 5);

    expect(onScan).toHaveBeenCalledWith({ barcode: VALID_EAN13, valid: true });
    expect(playScanSuccess).toHaveBeenCalledOnce();
    expect(playScanError).not.toHaveBeenCalled();
  });

  it("reports a fast scan with a bad check digit as invalid and plays the error tone", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    typeAsScanner(INVALID_EAN13, 5);

    expect(onScan).toHaveBeenCalledWith({ barcode: INVALID_EAN13, valid: false });
    expect(playScanError).toHaveBeenCalledOnce();
    expect(playScanSuccess).not.toHaveBeenCalled();
  });

  it("ignores slow, human-speed typing instead of treating it as a scan", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    typeAsScanner(VALID_EAN13, 80); // > 50ms Zeichenabstand

    expect(onScan).not.toHaveBeenCalled();
    expect(playScanSuccess).not.toHaveBeenCalled();
    expect(playScanError).not.toHaveBeenCalled();
  });

  it("discards a stale buffer after a >300ms pause instead of appending to it", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    let now = 1000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);

    // Erste drei Ziffern schnell, dann eine lange Pause, dann der Rest des
    // echten Barcodes schnell weiter — nur der zweite Teil darf zählen.
    for (const char of "301") {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      now += 5;
    }
    now += 500; // Pause > 300ms
    for (const char of VALID_EAN13) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      now += 5;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    nowSpy.mockRestore();

    expect(onScan).toHaveBeenCalledWith({ barcode: VALID_EAN13, valid: true });
  });

  describe("focused text field", () => {
    /**
     * Types into a real input like a browser: keydown first, and the character
     * only lands in the field if nobody called preventDefault. Returns the Enter
     * event so the test can check whether the form submit was blocked.
     */
    function typeIntoField(field: HTMLInputElement, text: string, gapMs: number) {
      let now = 1000;
      const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
      for (const char of text) {
        const keydown = new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true });
        field.dispatchEvent(keydown);
        if (!keydown.defaultPrevented) {
          field.value += char;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }
        now += gapMs;
      }
      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      field.dispatchEvent(enter);
      nowSpy.mockRestore();
      return enter;
    }

    function priceField(value: string) {
      const input = document.createElement("input");
      input.inputMode = "decimal";
      input.value = value;
      document.body.appendChild(input);
      input.focus();
      input.setSelectionRange(value.length, value.length);
      return input;
    }

    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("takes a scan out of a pre-filled price field, restores the price and reports the EAN", () => {
      const onScan = vi.fn();
      renderHook(() => useBarcodeScanner({ onScan }));
      const input = priceField("3.50");
      const formKeydown = vi.fn();
      input.addEventListener("keydown", formKeydown);

      const enter = typeIntoField(input, VALID_EAN13, 5);

      expect(input.value).toBe("3.50");
      expect(onScan).toHaveBeenCalledWith({ barcode: VALID_EAN13, valid: true });
      expect(enter.defaultPrevented).toBe(true);
      // The field's own Enter handler (form submit) never sees the scanner's Enter.
      expect(formKeydown.mock.calls.map(([event]) => event)).not.toContain(enter);
    });

    it("tells React about the restored value through an input event", () => {
      renderHook(() => useBarcodeScanner({ onScan: vi.fn() }));
      const input = priceField("3.50");
      const seen: string[] = [];
      input.addEventListener("input", () => seen.push(input.value));

      typeIntoField(input, "76123456", 5);

      expect(seen.at(-1)).toBe("3.50");
    });

    it("leaves human typing in a field alone", () => {
      const onScan = vi.fn();
      renderHook(() => useBarcodeScanner({ onScan }));
      const input = priceField("");

      const enter = typeIntoField(input, "1250", 120);

      expect(input.value).toBe("1250");
      expect(onScan).not.toHaveBeenCalled();
      expect(enter.defaultPrevented).toBe(false);
    });

    it("does not treat a short fast burst (under 8 digits) as a scan", () => {
      const onScan = vi.fn();
      renderHook(() => useBarcodeScanner({ onScan }));
      const input = priceField("");

      const enter = typeIntoField(input, "495", 5);

      expect(input.value).toBe("495");
      expect(onScan).not.toHaveBeenCalled();
      expect(enter.defaultPrevented).toBe(false);
    });

    it("does not count a burst that started in another field", () => {
      const onScan = vi.fn();
      renderHook(() => useBarcodeScanner({ onScan }));
      const first = priceField("");
      const second = priceField("");

      let now = 1000;
      const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
      for (const char of "1234567") {
        first.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
        now += 5;
      }
      second.dispatchEvent(new KeyboardEvent("keydown", { key: "8", bubbles: true }));
      now += 5;
      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      second.dispatchEvent(enter);
      nowSpy.mockRestore();

      expect(onScan).not.toHaveBeenCalled();
      expect(enter.defaultPrevented).toBe(false);
    });

    it("stays silent with feedback off but still undoes the burst", () => {
      const onScan = vi.fn();
      renderHook(() => useBarcodeScanner({ onScan, feedback: false }));
      const input = priceField("4.95");

      typeIntoField(input, VALID_EAN13, 5);

      expect(input.value).toBe("4.95");
      expect(onScan).toHaveBeenCalledWith({ barcode: VALID_EAN13, valid: true });
      expect(playScanSuccess).not.toHaveBeenCalled();
      expect(playScanError).not.toHaveBeenCalled();
    });
  });

  it("does nothing while disabled", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan, enabled: false }));

    typeAsScanner(VALID_EAN13, 5);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("resets the buffer on a Ctrl/Cmd shortcut instead of prepending it to the next scan", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    let now = 1000;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => now);
    for (const char of "301") {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      now += 5;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true }));
    for (const char of "7620422003") {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      now += 5;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    nowSpy.mockRestore();

    // Puffer wurde beim Ctrl+D geleert: es kommt nur "7620422003" an (10 Ziffern,
    // falsches Format), nicht das fälschlich zusammengesetzte "3017620422003".
    expect(onScan).toHaveBeenCalledWith({ barcode: "7620422003", valid: false });
  });

  describe("submitManualBarcode", () => {
    it("validates and reports a manually entered barcode with the same feedback path", () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useBarcodeScanner({ onScan }));

      result.current.submitManualBarcode(VALID_EAN13);

      expect(onScan).toHaveBeenCalledWith({ barcode: VALID_EAN13, valid: true });
      expect(playScanSuccess).toHaveBeenCalledOnce();
    });

    it("reports a UPC-A in its canonical EAN-13 form", () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useBarcodeScanner({ onScan }));

      result.current.submitManualBarcode("036000291452");

      expect(onScan).toHaveBeenCalledWith({ barcode: "0036000291452", valid: true });
    });

    it("ignores empty manual input", () => {
      const onScan = vi.fn();
      const { result } = renderHook(() => useBarcodeScanner({ onScan }));

      result.current.submitManualBarcode("   ");

      expect(onScan).not.toHaveBeenCalled();
    });
  });
});
