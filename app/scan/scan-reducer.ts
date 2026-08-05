import type { MappedOffProduct } from "@/lib/openfoodfacts/mapping";
import type { LookupResult, ProductSummary } from "./actions";

export type ScanState =
  | { status: "idle" }
  | { status: "looking-up"; ean: string }
  | { status: "existing"; product: ProductSummary }
  | { status: "new-hit"; ean: string; mapped: MappedOffProduct }
  | { status: "new-miss"; ean: string }
  | { status: "off-error"; ean: string }
  | { status: "invalid"; barcode: string }
  | { status: "saved"; message: string };

export type ScanResultAction = { kind: "invalid"; barcode: string } | { kind: "looking-up"; ean: string } | LookupResult;

export type ScanAction = { type: "scan"; result: ScanResultAction } | { type: "reset" } | { type: "saved"; message: string };

export const initialScanState: ScanState = { status: "idle" };

export function scanReducer(_state: ScanState, action: ScanAction): ScanState {
  if (action.type === "reset") return { status: "idle" };
  if (action.type === "saved") return { status: "saved", message: action.message };

  const result = action.result;
  switch (result.kind) {
    case "invalid":
      return { status: "invalid", barcode: result.barcode };
    case "looking-up":
      return { status: "looking-up", ean: result.ean };
    case "existing":
      return { status: "existing", product: result.product };
    case "off-hit":
      return { status: "new-hit", ean: result.ean, mapped: result.mapped };
    case "off-miss":
      return { status: "new-miss", ean: result.ean };
    case "off-error":
      return { status: "off-error", ean: result.ean };
  }
}
