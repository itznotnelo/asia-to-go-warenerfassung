import { NextResponse } from "next/server";
import { fetchOffProduct } from "@/lib/openfoodfacts/client";
import { mapOffToProduct } from "@/lib/openfoodfacts/mapping";

// 8/12/13/14-stellige numerische Barcodes — dieselben Längen wie beim Scanner-Hook.
const BARCODE_PATTERN = /^\d{8}$|^\d{12,14}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const { barcode } = await params;

  if (!BARCODE_PATTERN.test(barcode)) {
    return NextResponse.json({ error: "Ungültiger Barcode." }, { status: 400 });
  }

  const lookup = await fetchOffProduct(barcode);

  if (lookup.error) {
    return NextResponse.json(
      { found: false, error: true, message: "Open Food Facts ist gerade nicht erreichbar." },
      { status: 502 },
    );
  }

  if (!lookup.found || !lookup.product) {
    return NextResponse.json({ found: false, fromCache: lookup.fromCache });
  }

  return NextResponse.json({
    found: true,
    fromCache: lookup.fromCache,
    product: mapOffToProduct(lookup.product),
  });
}
