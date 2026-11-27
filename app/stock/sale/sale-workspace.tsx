"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageBox } from "@/components/stock/message-box";
import { ProductPicker, type ProductPickerHandle } from "@/components/stock/product-picker";
import { inputClass } from "@/lib/input-class";
import { playScanError } from "@/lib/scan-feedback";
import { formatStockQty, inputUnitLabel, parseQtyInput } from "@/lib/stock/units";
import type { StockProductView } from "@/lib/stock/product-stock";
import { cn } from "@/lib/utils";
import { bookShopSaleAction, lookupStockProductAction, undoStockMovementAction } from "@/app/stock/actions";

interface BookedSale {
  movementId: string;
  productId: string;
  nameDe: string;
  unitType: StockProductView["unitType"];
  quantity: number;
  stockAfter: number;
  undone: boolean;
}

/**
 * Verkauf erfassen (no till connected): scan, quantity 1 is preset, Enter
 * books. Scanning the next article books the open one first, so a run of
 * single items is just scan, scan, scan.
 */
export function SaleWorkspace({ returnedEan }: { returnedEan: string | null }) {
  const router = useRouter();
  const pickerRef = useRef<ProductPickerHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<StockProductView | null>(null);
  const [qty, setQty] = useState("1");
  const [booked, setBooked] = useState<BookedSale[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warning"; text: string } | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The open article while a booking runs, so a fast second scan can't book it twice.
  const bookingRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (!returnedEan) return;
    void lookupStockProductAction(returnedEan).then((product) => {
      if (product) open(product);
      router.replace("/stock/sale");
    });
    // open() is stable enough for a one-time return; run on the param only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedEan]);

  useEffect(() => {
    if (!pending) return;
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, [pending]);

  function open(product: StockProductView) {
    if (product.stockQty === null) {
      playScanError();
      setPending(null);
      setMessage({
        tone: "warning",
        text: `${product.nameDe}: für diesen Artikel wird noch kein Bestand geführt. Erst zählen (Inventur) oder eine Lieferung einbuchen.`,
      });
      return;
    }
    setQty("1");
    setPending(product);
  }

  async function bookPending(product: StockProductView, qtyText: string): Promise<boolean> {
    const quantity = parseQtyInput(qtyText, product.unitType);
    if (quantity === null || quantity < 1) {
      setMessage({ tone: "error", text: `Menge für ${product.nameDe} nicht lesbar. Bitte eine Zahl ab 1.` });
      return false;
    }
    setBusy(true);
    const result = await bookShopSaleAction({ productId: product.id, quantity });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return false;
    }
    const sale: BookedSale = {
      movementId: result.data.movementId,
      productId: product.id,
      nameDe: product.nameDe,
      unitType: product.unitType,
      quantity,
      stockAfter: result.data.stockAfter,
      undone: false,
    };
    setBooked((list) => [sale, ...list].slice(0, 50));
    setMessage(
      sale.stockAfter < 0
        ? { tone: "warning", text: `${product.nameDe} gebucht. Bestand jetzt ${formatStockQty(sale.stockAfter, product.unitType)}: bitte nachzählen.` }
        : { tone: "ok", text: `${product.nameDe}: ${formatStockQty(quantity, product.unitType)} verkauft. Bestand jetzt ${formatStockQty(sale.stockAfter, product.unitType)}.` },
    );
    return true;
  }

  async function handlePick(product: StockProductView) {
    setUnknownEan(null);
    if (bookingRef.current) await bookingRef.current;
    if (pending) {
      const run = bookPending(pending, qty);
      bookingRef.current = run;
      const ok = await run;
      bookingRef.current = null;
      if (!ok) return; // keep the failed one on screen, drop nothing silently
    }
    open(product);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || bookingRef.current) return;
    const run = bookPending(pending, qty);
    bookingRef.current = run;
    const ok = await run;
    bookingRef.current = null;
    if (ok) {
      setPending(null);
      pickerRef.current?.focus();
    }
  }

  async function undo(sale: BookedSale) {
    const result = await undoStockMovementAction({ movementId: sale.movementId });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setBooked((list) => list.map((entry) => (entry.movementId === sale.movementId ? { ...entry, undone: true } : entry)));
    setMessage({ tone: "ok", text: `${sale.nameDe}: Verkauf rückgängig gemacht.` });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-8 pb-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold">Verkauf erfassen</h1>
        <p className="text-sm text-muted-foreground">Für Verkäufe im Laden, solange keine Kasse angeschlossen ist. Scannen, Menge prüfen, Enter.</p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4">
        <p className="text-sm font-medium text-primary">{pending ? "Menge prüfen, dann Enter (oder gleich weiterscannen)" : "Bereit: Artikel scannen"}</p>
        <ProductPicker ref={pickerRef} onPick={(product) => void handlePick(product)} onUnknown={(ean) => setUnknownEan(ean)} label="Verkauften Artikel scannen" />

        {pending && (
          <form
            onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setPending(null);
                pickerRef.current?.focus();
              }
            }}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
          >
            <div className="flex min-w-48 flex-1 flex-col">
              <span className="font-medium">{pending.nameDe}</span>
              <span className="text-sm text-muted-foreground">
                Bestand {formatStockQty(pending.stockQty ?? 0, pending.unitType)}
              </span>
            </div>
            <label className="flex w-32 flex-col gap-1 text-sm">
              Menge ({inputUnitLabel(pending.unitType)})
              <input ref={qtyRef} value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" className={cn(inputClass(), "font-numeric text-lg")} />
            </label>
            <Button type="submit" className="h-11 px-4" disabled={busy}>
              {busy ? "Bucht …" : "Verkauft (Enter)"}
            </Button>
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setPending(null)}>
              Abbrechen (Esc)
            </Button>
          </form>
        )}

        {unknownEan && (
          <MessageBox tone="warning">
            <p>
              Barcode <span className="font-numeric">{unknownEan}</span> ist noch nicht erfasst. Ohne Artikel kann nichts gebucht werden.
            </p>
            <Link
              href={`/scan?ean=${encodeURIComponent(unknownEan)}&back=${encodeURIComponent("/stock/sale")}`}
              className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
            >
              Artikel jetzt erfassen
            </Link>
          </MessageBox>
        )}
      </section>

      {message && <MessageBox tone={message.tone}>{message.text}</MessageBox>}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Eben gebucht</h2>
        {booked.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch nichts in dieser Sitzung.</p>
        ) : (
          <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
            {booked.map((sale, index) => {
              // Only the newest sale of an article can be undone (the ledger refuses older ones).
              const newestForProduct = booked.findIndex((entry) => entry.productId === sale.productId) === index;
              return (
                <li
                  key={sale.movementId}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0",
                    sale.undone && "text-muted-foreground line-through",
                  )}
                >
                  <span>{sale.nameDe}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-numeric">-{formatStockQty(sale.quantity, sale.unitType)}</span>
                    {!sale.undone && newestForProduct && (
                      <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void undo(sale)}>
                        Rückgängig
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        Alle Buchungen stehen unter{" "}
        <Link href="/stock/movements" className="underline underline-offset-4">
          Buchungen
        </Link>
        .
      </p>
    </div>
  );
}
