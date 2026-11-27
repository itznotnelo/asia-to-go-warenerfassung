import Link from "next/link";
import { listStocktakes } from "@/lib/stock/queries";
import { getCategories } from "@/app/scan/actions";
import { NewStocktakeForm } from "./new-stocktake-form";

import { EmptyState, PageHeader, SectionTitle, listCardClass, pageClass } from "@/components/page";

export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
}

export default async function StocktakesPage() {
  const [stocktakes, categories] = await Promise.all([listStocktakes(), getCategories()]);
  const open = stocktakes.filter((s) => s.status === "open");
  const booked = stocktakes.filter((s) => s.status === "booked");

  return (
    <main className={pageClass()}>
      <PageHeader title="Inventur" description="Regal zählen und den Bestand korrigieren." />

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
        <SectionTitle title="Neue Zählung" />
        <p className="-mt-2 max-w-prose text-sm text-muted-foreground">
          Es muss nicht alles auf einmal sein: ein Regal oder eine Kategorie pro Zählung reicht. Nur gezählte Artikel werden korrigiert. Wer eine
          Kategorie wählt, sieht, was dort noch nicht gezählt ist.
        </p>
        <NewStocktakeForm categories={categories.map((c) => ({ id: c.id, name: c.parentName ? `${c.parentName} · ${c.name}` : c.name }))} />
      </section>

      {open.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle title="Noch nicht gebucht" tone="warn" />
          <List items={open} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle title="Gebuchte Zählungen" />
        {booked.length === 0 ? <EmptyState title="Noch keine Zählung gebucht." /> : <List items={booked} />}
      </section>

      <p className="text-sm text-muted-foreground">
        Für den Jahresabschluss:{" "}
        <Link href="/stock/inventory" className="underline underline-offset-4 hover:text-foreground">
          Inventarliste zu Einkaufspreisen
        </Link>
        .
      </p>
    </main>
  );
}

function List({ items }: { items: Awaited<ReturnType<typeof listStocktakes>> }) {
  return (
    <ul className={listCardClass}>
      {items.map((item) => (
        <li key={item.id} className="border-b border-border last:border-b-0">
          <Link href={`/stock/counts/${item.id}`} className="-mx-4 flex min-h-12 items-center justify-between gap-4 px-4 py-2 transition-colors hover:bg-muted/40">
            <span>
              {item.title}
              {item.categoryName && <span className="text-muted-foreground"> · {item.categoryName}</span>}
            </span>
            <span className="font-numeric text-sm whitespace-nowrap text-muted-foreground">
              {item.lineCount} gezählt · {formatDay(item.bookedAt ?? item.createdAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
