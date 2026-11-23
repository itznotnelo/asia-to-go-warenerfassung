"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MessageBox } from "@/components/stock/message-box";
import { ProductPicker, type ProductPickerHandle } from "@/components/stock/product-picker";
import { inputClass } from "@/lib/input-class";
import { formatChf } from "@/lib/pricing";
import { formatStockQty, inputUnitLabel, parseQtyInput, qtyToInput } from "@/lib/stock/units";
import type { StocktakeDetail } from "@/lib/stock/queries";
import type { StockProductView } from "@/lib/stock/product-stock";
import { cn } from "@/lib/utils";
import {
  bookStocktakeAction,
  cancelStocktakeAction,
  countStocktakeLineAction,
  lookupStockProductAction,
  removeStocktakeLineAction,
} from "@/app/stock/actions";

interface Current {
  product: StockProductView;
  counted: number;
}

function signed(qty: number, unitType: StockProductView["unitType"]): string {
  return `${qty > 0 ? "+" : ""}${formatStockQty(qty, unitType)}`;
}

/**
 * Inventur: every scan counts one piece of that article; typing a number and
 * Enter sets the count exactly (for a full carton). The diff list below is
 * what booking will change.
 */
export function CountWorkspace({ stocktake, returnedEan }: { stocktake: StocktakeDetail; returnedEan: string | null }) {
  const router = useRouter();
  const pickerRef = useRef<ProductPickerHandle>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [typed, setTyped] = useState("");
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "warning"; text: string } | null>(null);
  const [confirmBook, setConfirmBook] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = stocktake.status === "open";

  useEffect(() => {
    if (!returnedEan || !open) return;
    void lookupStockProductAction(returnedEan).then((product) => {
      if (product) void count(product, "add", 1);
      router.replace(`/stock/counts/${stocktake.id}`);
    });
    // One-time continuation after capturing an unknown article on /scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedEan]);

  useEffect(() => {
    if (!current) return;
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, [current]);

  async function count(product: StockProductView, mode: "add" | "set", quantity: number) {
    const result = await countStocktakeLineAction({ stocktakeId: stocktake.id, productId: product.id, mode, quantity });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setCurrent({ product, counted: result.data.countedQty });
    setTyped(qtyToInput(result.data.countedQty, product.unitType));
    setMessage({ tone: "ok", text: `${product.nameDe}: ${formatStockQty(result.data.countedQty, product.unitType)} gezählt` });
    router.refresh();
  }

  function pick(product: StockProductView) {
    setUnknownEan(null);
    // Loose goods are weighed, not scanned piece by piece: open the field without adding.
    if (product.unitType !== "piece") {
      const line = stocktake.lines.find((l) => l.productId === product.id);
      setCurrent({ product, counted: line?.countedQty ?? 0 });
      setTyped(line ? qtyToInput(line.countedQty, product.unitType) : "");
      return;
    }
    void count(product, "add", 1);
  }

  function submitTyped(event: React.FormEvent) {
    event.preventDefault();
    if (!current) return;
    const quantity = parseQtyInput(typed, current.product.unitType);
    if (quantity === null) {
      setMessage({ tone: "error", text: "Bitte eine Zahl ab 0 eingeben." });
      return;
    }
    void count(current.product, "set", quantity).then(() => {
      setCurrent(null);
      pickerRef.current?.focus();
    });
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, done?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      done?.();
      router.refresh();
    });
  }

  const { summary } = stocktake;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Inventur: {stocktake.title}
          {stocktake.categoryName && <span className="text-base font-normal text-muted-foreground"> · {stocktake.categoryName}</span>}
        </h1>
        <Link href="/stock/counts" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
          Alle Zählungen
        </Link>
      </div>

      {stocktake.status === "booked" && <MessageBox tone="ok">Gebucht. {summary.changed} Artikel korrigiert.</MessageBox>}
      {stocktake.status === "cancelled" && <MessageBox tone="warning">Diese Zählung wurde verworfen.</MessageBox>}

      {open && (
        <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4">
          <p className="text-sm font-medium text-primary">Jeder Scan zählt 1 Stück. Ganzen Karton? Zahl eintippen und Enter.</p>
          <ProductPicker ref={pickerRef} onPick={pick} onUnknown={(ean) => setUnknownEan(ean)} label="Artikel scannen" />
          {current && (
            <form
              onSubmit={submitTyped}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCurrent(null);
                  pickerRef.current?.focus();
                }
              }}
              className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-48 flex-1 flex-col">
                <span className="font-medium">{current.product.nameDe}</span>
                <span className="text-sm text-muted-foreground">Gezählt bisher: {formatStockQty(current.counted, current.product.unitType)}</span>
              </div>
              <label className="flex w-36 flex-col gap-1 text-sm">
                Gezählt ({inputUnitLabel(current.product.unitType)})
                <input ref={qtyRef} value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="decimal" className={cn(inputClass(), "font-numeric text-lg")} />
              </label>
              <Button type="submit" className="h-11 px-4">
                Übernehmen (Enter)
              </Button>
            </form>
          )}
          {unknownEan && (
            <MessageBox tone="warning">
              <p>
                Barcode <span className="font-numeric">{unknownEan}</span> ist noch nicht erfasst.
              </p>
              <Link
                href={`/scan?ean=${encodeURIComponent(unknownEan)}&back=${encodeURIComponent(`/stock/counts/${stocktake.id}`)}`}
                className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
              >
                Artikel jetzt erfassen und zurückkommen
              </Link>
            </MessageBox>
          )}
        </section>
      )}

      {message && <MessageBox tone={message.tone}>{message.text}</MessageBox>}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Gezählt: {summary.counted} Artikel, davon {summary.changed} mit Abweichung
          </h2>
          <p className="text-sm">
            Mehr <span className="font-numeric text-success">{formatChf(summary.plusValueRappen)}</span> · Weniger{" "}
            <span className="font-numeric text-destructive">{formatChf(summary.minusValueRappen)}</span>
            {summary.withoutCost > 0 && <span className="text-muted-foreground"> ({summary.withoutCost} ohne EK)</span>}
          </p>
        </div>
        {stocktake.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch nichts gezählt.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-normal">Artikel</th>
                  <th className="px-3 py-2 text-right font-normal">Erwartet</th>
                  <th className="px-3 py-2 text-right font-normal">Gezählt</th>
                  <th className="px-3 py-2 text-right font-normal">Differenz</th>
                  {open && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {stocktake.lines.map((line) => (
                  <tr key={line.productId} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">{line.nameDe}</td>
                    <td className="font-numeric px-3 py-2 text-right text-muted-foreground">{formatStockQty(line.expectedQty, line.unitType)}</td>
                    <td className="font-numeric px-3 py-2 text-right">{formatStockQty(line.countedQty, line.unitType)}</td>
                    <td
                      className={cn(
                        "font-numeric px-3 py-2 text-right",
                        line.diff > 0 && "text-success",
                        line.diff < 0 && "text-destructive",
                        line.diff === 0 && "text-muted-foreground",
                      )}
                    >
                      {line.diff === 0 ? "stimmt" : signed(line.diff, line.unitType)}
                      {line.diffValueRappen !== null && line.diff !== 0 && <span className="block text-xs">{formatChf(line.diffValueRappen)}</span>}
                    </td>
                    {open && (
                      <td className="px-3 py-1 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 px-3 text-muted-foreground"
                          disabled={pending}
                          onClick={() => run(() => removeStocktakeLineAction({ stocktakeId: stocktake.id, productId: line.productId }))}
                        >
                          Entfernen
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stocktake.notCounted.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm">
            Noch nicht gezählt in {stocktake.categoryName}: {stocktake.notCounted.length} Artikel
          </summary>
          <ul className="mt-2 flex flex-col text-sm">
            {stocktake.notCounted.map((product) => (
              <li key={product.id} className="flex justify-between border-b border-border py-2 last:border-b-0">
                <span>{product.nameDe}</span>
                <span className="font-numeric text-muted-foreground">
                  {product.stockQty === null ? "kein Bestand geführt" : `erwartet ${formatStockQty(product.stockQty, product.unitType)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-3">
          {confirmBook ? (
            <>
              <span className="text-sm">
                {summary.changed} Artikel korrigieren? Artikel ohne Abweichung bleiben, wie sie sind.
              </span>
              <Button
                type="button"
                className="h-11 px-4"
                disabled={pending}
                onClick={() => run(() => bookStocktakeAction({ id: stocktake.id }), () => setConfirmBook(false))}
              >
                {pending ? "Wird gebucht …" : "Ja, Inventur buchen"}
              </Button>
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setConfirmBook(false)}>
                Zurück
              </Button>
            </>
          ) : (
            <>
              <Button type="button" className="h-11 px-4" disabled={pending || stocktake.lines.length === 0} onClick={() => setConfirmBook(true)}>
                Inventur buchen
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-4 text-muted-foreground"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Diese Zählung verwerfen? Es wird nichts gebucht.")) {
                    run(() => cancelStocktakeAction({ id: stocktake.id }), () => router.push("/stock/counts"));
                  }
                }}
              >
                Zählung verwerfen
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
