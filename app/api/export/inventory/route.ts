import { getInventoryList } from "@/lib/stock/queries";
import { inventoryCsv } from "@/lib/stock/inventory-list";
import { formatDateOnly, parseDateOnly, shopToday } from "@/lib/stock/dates";

export const dynamic = "force-dynamic";

/** Inventarliste as Swiss Excel CSV. ?date=YYYY-MM-DD = stock at the end of that day, else today's stock. */
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("date");
  const cutoff = requested && parseDateOnly(requested) ? requested : null;
  const list = await getInventoryList(cutoff);
  const day = cutoff ?? shopToday();
  return new Response(inventoryCsv(list, formatDateOnly(parseDateOnly(day) as Date)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventar-${day}.csv"`,
    },
  });
}
