/**
 * Pages that run their own barcode scanner hook. Everywhere else the
 * ScannerFieldGuard catches a scan that would land in a focused field.
 */
export function pageHasOwnScanner(pathname: string): boolean {
  return (
    pathname === "/scan" ||
    pathname === "/stock/sale" ||
    /^\/stock\/receipts\/[^/]+$/.test(pathname) ||
    /^\/stock\/counts\/[^/]+$/.test(pathname)
  );
}

/**
 * Where /scan may send the user back to after capturing an unknown article
 * from a stock scan mode. Only those pages, so ?back= can't point elsewhere.
 */
export function safeReturnPath(back: string | null | undefined): string | null {
  if (!back) return null;
  return back === "/stock/sale" || /^\/stock\/(receipts|counts)\/[A-Za-z0-9_-]{1,64}$/.test(back) ? back : null;
}
