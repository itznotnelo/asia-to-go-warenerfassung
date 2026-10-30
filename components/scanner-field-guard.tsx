"use client";

import { usePathname } from "next/navigation";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { playScanError } from "@/lib/scan-feedback";

/**
 * Outside /scan nothing handles a scan, but a focused price field would still
 * take the EAN as its value. The hook undoes such a burst; the error tone tells
 * the user the scan went nowhere. /scan runs its own scanner hook.
 */
export function ScannerFieldGuard() {
  const pathname = usePathname();
  useBarcodeScanner({ onScan: playScanError, enabled: pathname !== "/scan", feedback: false });
  return null;
}
