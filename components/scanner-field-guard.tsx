"use client";

import { usePathname } from "next/navigation";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { playScanError } from "@/lib/scan-feedback";
import { pageHasOwnScanner } from "@/lib/scanner-pages";

/**
 * Outside /scan nothing handles a scan, but a focused price field would still
 * take the EAN as its value. The hook undoes such a burst; the error tone tells
 * the user the scan went nowhere. /scan and the stock scan modes run their own
 * scanner hook.
 */
export function ScannerFieldGuard() {
  const pathname = usePathname();
  useBarcodeScanner({ onScan: playScanError, enabled: !pageHasOwnScanner(pathname), feedback: false });
  return null;
}
