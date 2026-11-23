import Link from "next/link";
import { listStocktakes } from "@/lib/stock/queries";
import { getCategories } from "@/app/scan/actions";
import { NewStocktakeForm } from "./new-stocktake-form";

export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
}

export default async function StocktakesPage() {
  const [stocktakes, categories] = await Promise.all([listStocktakes(), getCategories()]);
  const open = stocktakes.filter((s) => s.status === "open");
  const booked = stocktakes.filter((s) => s.status === "booked");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <h1 className="text-xl font-semibold">Inventur</h1>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">Neue Zählung</h2>
        <p className="text-sm text-muted-foreground">
          Es muss nicht alles auf einmal sein: ein Regal oder eine Kategorie pro Zählung reicht. Nur gezählte Artikel werden korrigiert. Wer eine
          Kategorie wählt, sieht, was dort noch nicht gezählt ist.
        </p>
        <NewStocktakeForm categories={categories.map((c) => ({ id: c.id, name: c.parentName ? `${c.parentName} · ${c.name}` : c.name }))} />
      </section>

      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Noch nicht gebucht</h2>
          <List items={open} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Gebuchte Zählungen</h2>
        {booked.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine.</p> : <List items={booked} />}
      </section>

      <p className="text-sm text-muted-foreground">
        Für den Jahresabschluss:{" "}
        <Link href="/stock/inventory" className="underline underline-offset-2">
          Inventarliste zu Einkaufspreisen
        </Link>
        .
      </p>
    </div>
  );
}

function List({ items }: { items: Awaited<ReturnType<typeof listStocktakes>> }) {
  return (
    <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
      {items.map((item) => (
        <li key={item.id} className="border-b border-border last:border-b-0">
          <Link href={`/stock/counts/${item.id}`} className="flex min-h-12 items-center justify-between gap-4 py-2 hover:underline">
            <span>
              {item.title}
              {item.categoryName && <span className="text-muted-foreground"> · {item.categoryName}</span>}
            </span>
            <span className="text-sm text-muted-foreground">
              {item.lineCount} gezählt · {formatDay(item.bookedAt ?? item.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
