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
// A burst into a focused field only counts as a scan from EAN-8 upwards, so a
// fast typist entering a short price is never taken for the scanner.
const MIN_FIELD_SCAN_DIGITS = 8;

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
  /** `false` = no success/error tone (for the field guard on pages without a scan workflow). */
  feedback?: boolean;
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

type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(target: EventTarget | null): target is TextField {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Sets a field value so React notices it: React tracks the last value it set,
 * so a plain `field.value = x` would be swallowed. The prototype setter plus a
 * bubbling input event goes through React's onChange like real typing.
 */
function restoreFieldValue(field: TextField, value: string, selectionStart: number | null, selectionEnd: number | null) {
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  if (selectionStart === null || selectionEnd === null) return;
  try {
    field.setSelectionRange(selectionStart, selectionEnd);
  } catch {
    // Some input types (number, email) have no selection API; the value is what matters.
  }
}

function reportScan(onScan: (result: ScanResult) => void, barcode: string, feedback = true) {
  const valid = isValidBarcode(barcode);
  if (feedback) {
    if (valid) {
      playScanSuccess();
    } else {
      playScanError();
    }
  }
  onScan({ barcode, valid });
}

export function useBarcodeScanner({ onScan, enabled = true, feedback = true }: UseBarcodeScannerOptions): UseBarcodeScannerResult {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    let buffer = "";
    let lastCharTime = 0;
    // Wird auf `false` gesetzt, sobald ein Zeichenabstand >= 50ms auftrat —
    // dann ist es kein Scanner, sondern jemand tippt zufällig Ziffern.
    let looksLikeScanner = true;

    // Burst into a focused text field. The digits do land in the field (we
    // only know it was the scanner once Enter arrives), so the value from
    // before the first digit is kept to undo them.
    let field: {
      target: TextField;
      digits: string;
      lastTime: number;
      valueBefore: string;
      selectionStart: number | null;
      selectionEnd: number | null;
    } | null = null;

    function reset() {
      buffer = "";
      looksLikeScanner = true;
    }

    function handleFieldKeydown(event: KeyboardEvent, target: TextField) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        field = null;
        return;
      }
      if (IGNORED_KEYS.has(event.key)) return;

      const now = performance.now();
      const burstGoesOn = field !== null && field.target === target && now - field.lastTime < FAST_CHAR_GAP_MS;

      if (event.key === "Enter") {
        const burst = burstGoesOn ? field : null;
        field = null;
        if (!burst || burst.digits.length < MIN_FIELD_SCAN_DIGITS) return;
        // The scanner's Enter must not submit the form with the EAN in it.
        event.preventDefault();
        event.stopPropagation();
        restoreFieldValue(target, burst.valueBefore, burst.selectionStart, burst.selectionEnd);
        reportScan(onScanRef.current, burst.digits, feedback);
        return;
      }

      if (!/^\d$/.test(event.key)) {
        field = null;
        return;
      }

      if (burstGoesOn && field) {
        field.digits += event.key;
        field.lastTime = now;
        return;
      }
      // keydown runs before the character is inserted, so this is the clean value.
      field = {
        target,
        digits: event.key,
        lastTime: now,
        valueBefore: target.value,
        selectionStart: target.selectionStart,
        selectionEnd: target.selectionEnd,
      };
    }

    function handleKeydown(event: KeyboardEvent) {
      if (isTextField(event.target)) {
        handleFieldKeydown(event, event.target);
        return;
      }
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
          reportScan(onScanRef.current, barcode, feedback);
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

    // Capture phase: runs before the field's own handlers and before the
    // form sees the scanner's Enter.
    document.addEventListener("keydown", handleKeydown, true);
    return () => document.removeEventListener("keydown", handleKeydown, true);
  }, [enabled, feedback]);

  const submitManualBarcode = useCallback((value: string) => {
    const barcode = value.trim();
    if (!barcode) return;
    reportScan(onScanRef.current, barcode);
  }, []);

  return { submitManualBarcode };
}
