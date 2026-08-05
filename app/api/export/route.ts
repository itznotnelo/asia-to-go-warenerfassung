import { prisma } from "@/lib/prisma";
import { toExportRow } from "@/lib/product-export";
import { toCsv } from "@/lib/csv";

/** Vollständiger Artikel-Export für Backup und externe Weiterverarbeitung — ?format=json (Default) oder csv. */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";

  const products = await prisma.product.findMany({ include: { category: true }, orderBy: { sku: "asc" } });
  const rows = products.map(toExportRow);
  const timestamp = new Date().toISOString().slice(0, 10);

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
