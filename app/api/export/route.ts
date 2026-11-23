import { prisma } from "@/lib/prisma";
import { toExportRow } from "@/lib/product-export";
import { toCsv } from "@/lib/csv";
import { toExcelCsv } from "@/lib/excel-export";

/**
 * Vollständiger Artikel-Export — ?format=json (Default) oder csv bleiben verlustfrei,
 * ?format=excel ist die lesbare Variante für Excel (Semikolon, CHF statt Rappen).
 */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("format");
  const format = requested === "csv" || requested === "excel" ? requested : "json";

  // Gelöschte (archivierte) Artikel gehören nicht in die Artikelliste; die
  // Datensicherung (pg_dump) enthält sie weiterhin.
  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    include: { category: true },
    orderBy: { sku: "asc" },
  });
  const rows = products.map(toExportRow);
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    return new Response(toExcelCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="artikel-excel-${timestamp}.csv"`,
      },
    });
  }

  if (format === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="artikel-${timestamp}.csv"`,
      },
    });
  }

  return new Response(JSON.stringify(rows, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="artikel-${timestamp}.json"`,
    },
  });
}
