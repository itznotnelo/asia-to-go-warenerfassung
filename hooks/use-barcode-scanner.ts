"use client";

import { useCallback, useEffect, useRef } from "react";
import { isValidBarcode } from "@/lib/barcode";
import { playScanError, playScanSuccess } from "@/lib/scan-feedback";

// Ein USB-Handscanner verhält sich wie eine sehr schnelle Tastatur: Ziffern
// mit < 50ms Abstand, abgeschlossen durch Enter. Eine Pause > 300ms zwischen
// zwei Ziffern verwirft den bisherigen Puffer, statt ihn an neue Zeichen
// anzuhängen — verhindert, dass liegengebliebene Zeichen einen echten Scan
// verfälschen.
const FAST_CHAR_GAP_MS = 50;
const STALE_BUFFER_GAP_MS = 300;

// Modifier/Navigationstasten allein unterbrechen einen laufenden Scan nicht,
// lösen aber auch kein Zeichen aus.
const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"]);

export interface ScanResult {
  barcode: string;
  /** EAN-Format + Prüfziffer korrekt. `false` heisst: Ton "Fehler", kein Lookup versuchen. */
  valid: boolean;
}

export interface UseBarcodeScannerOptions {
  onScan: (result: ScanResult) => void;
  /** Auf `false` setzen, um den Scanner temporär stillzulegen (z.B. während ein Dialog offen ist). */
  enabled?: boolean;
}

export interface UseBarcodeScannerResult {
  /** Für das manuelle Eingabefeld — gleiche Validierung, gleiches Feedback wie ein echter Scan. */
  submitManualBarcode: (value: string) => void;
}

/** Pausiert den Scanner-Listener, während ein Textfeld fokussiert ist. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function reportScan(onScan: (result: ScanResult) => void, barcode: string) {
  const valid = isValidBarcode(barcode);
  if (valid) {
    playScanSuccess();
  } else {
    playScanError();
  }
  onScan({ barcode, valid });
}

export function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastCharTime = 0;
    // Wird auf `false` gesetzt, sobald ein Zeichenabstand >= 50ms auftrat —
    // dann ist es kein Scanner, sondern jemand tippt zufällig Ziffern.
    let looksLikeScanner = true;

    function reset() {
      buffer = "";
      looksLikeScanner = true;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return;

      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }
      if (IGNORED_KEYS.has(event.key)) return;

      if (event.key === "Enter") {
        const barcode = buffer;
        const scanWasFastEnough = looksLikeScanner;
        reset();
        if (barcode && scanWasFastEnough) {
          reportScan(onScanRef.current, barcode);
        }
        return;
      }

      if (!/^\d$/.test(event.key)) {
        reset();
        return;
      }

      const now = performance.now();
      if (buffer.length > 0) {
        const gap = now - lastCharTime;
        if (gap > STALE_BUFFER_GAP_MS) {
          reset();
        } else if (gap >= FAST_CHAR_GAP_MS) {
          looksLikeScanner = false;
        }
      }

      buffer += event.key;
      lastCharTime = now;
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [enabled]);

  const submitManualBarcode = useCallback((value: string) => {
    const barcode = value.trim();
    if (!barcode) return;
    reportScan(onScanRef.current, barcode);
  }, []);

  return { submitManualBarcode };
}
