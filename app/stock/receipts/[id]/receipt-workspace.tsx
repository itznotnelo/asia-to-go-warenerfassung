"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MessageBox } from "@/components/stock/message-box";
import { ProductPicker, type ProductPickerHandle } from "@/components/stock/product-picker";
import { inputClass } from "@/lib/input-class";
import { formatChf, parseChfToRappen } from "@/lib/pricing";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { costBasisLabel, formatPacks, formatStockQty, inputUnitLabel, parseQtyInput, qtyToInput } from "@/lib/stock/units";
import type { ReceiptDetail } from "@/lib/stock/queries";
import type { StockProductView } from "@/lib/stock/product-stock";
import { cn } from "@/lib/utils";
import {
  addReceiptLineAction,
  bookReceiptAction,
  cancelReceiptAction,
  lookupStockProductAction,
  removeReceiptLineAction,
  setReceiptSupplierAction,
} from "@/app/stock/actions";

interface Props {
  receipt: ReceiptDetail;
  suppliers: { id: string; name: string }[];
  /** Barcode of an article just captured on /scan, to continue with it. */
  returnedEan: string | null;
}

function rappenToInput(rappen: number | null): string {
  if (rappen === null) return "";
  return (rappen / 100).toFixed(2);
}

export function ReceiptWorkspace({ receipt, suppliers, returnedEan }: Props) {
  const router = useRouter();
  const pickerRef = useRef<ProductPickerHandle>(null);
  const [current, setCurrent] = useState<StockProductView | null>(null);
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmBook, setConfirmBook] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = receipt.status === "open";

  // Back from capturing an unknown article on /scan: continue with it.
  useEffect(() => {
    if (!returnedEan || !open) return;
    void lookupStockProductAction(returnedEan).then((product) => {
      if (product) setCurrent(product);
      router.replace(`/stock/receipts/${receipt.id}`);
    });
  }, [returnedEan, open, receipt.id, router]);

  function pick(product: StockProductView) {
    setUnknownEan(null);
    // A new scan while a line is still open: say so instead of losing it silently.
    setMessage(current && current.id !== product.id ? { tone: "error", text: `${current.nameDe} wurde nicht hinzugefügt (kein Enter gedrückt).` } : null);
    setCurrent(product);
  }

  function unknown(ean: string) {
    setCurrent(null);
    setUnknownEan(ean);
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

  function changeSupplier(supplierId: string) {
    run(() => setReceiptSupplierAction({ id: receipt.id, supplierId: supplierId || null, deliveryNote: receipt.deliveryNote ?? "" }));
  }

  function book() {
    run(
      () => bookReceiptAction({ id: receipt.id }),
      () => {
        setConfirmBook(false);
        setMessage({ tone: "ok", text: "Lieferung eingebucht. Der Bestand ist aktualisiert." });
      },
    );
  }

  function cancel() {
    if (!window.confirm("Diese Lieferung verwerfen? Es wird nichts gebucht.")) return;
    run(() => cancelReceiptAction({ id: receipt.id }), () => router.push("/stock/receipts"));
  }

  const backHref = `/stock/receipts/${receipt.id}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Wareneingang{receipt.supplierName ? `: ${receipt.supplierName}` : ""}
          {receipt.deliveryNote && <span className="text-base font-normal text-muted-foreground"> · Lieferschein {receipt.deliveryNote}</span>}
        </h1>
        <Link href="/stock/receipts" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
          Alle Lieferungen
        </Link>
      </div>

      {receipt.status === "booked" && <MessageBox tone="ok">Gebucht am {new Date(receipt.bookedAt as string).toLocaleString("de-CH", { timeZone: "Europe/Zurich" })}.</MessageBox>}
      {receipt.status === "cancelled" && <MessageBox tone="warning">Diese Lieferung wurde verworfen.</MessageBox>}
      {message && <MessageBox tone={message.tone}>{message.text}</MessageBox>}

      {open && (
        <>
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            Lieferant
            <select value={receipt.supplierId ?? ""} onChange={(event) => changeSupplier(event.target.value)} className={inputClass()} disabled={pending}>
              <option value="">Ohne Lieferant</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <section className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4">
            <p className="text-sm font-medium text-primary">{current ? "Menge erfassen, dann Enter" : "Bereit: nächsten Artikel scannen"}</p>
            <ProductPicker ref={pickerRef} onPick={pick} onUnknown={unknown} label="Artikel scannen" />

            {unknownEan && (
              <MessageBox tone="warning">
                <p>Barcode <span className="font-numeric">{unknownEan}</span> ist noch nicht erfasst.</p>
                <Link
                  href={`/scan?ean=${encodeURIComponent(unknownEan)}&back=${encodeURIComponent(backHref)}`}
                  className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
                >
                  Artikel jetzt erfassen und zurückkommen
                </Link>
              </MessageBox>
            )}

            {current && (
              <LineForm
                key={current.id}
                product={current}
                receiptId={receipt.id}
                onDone={(text) => {
                  setCurrent(null);
                  setMessage({ tone: "ok", text });
                  router.refresh();
                  pickerRef.current?.focus();
                }}
                onCancel={() => {
                  setCurrent(null);
                  pickerRef.current?.focus();
                }}
                onError={(text) => setMessage({ tone: "error", text })}
              />
            )}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Positionen ({receipt.lines.length})</h2>
          <p className="text-sm">
            Total EK <span className="font-numeric font-medium">{formatChf(receipt.totalCostRappen)}</span>
            {receipt.linesWithoutCost > 0 && <span className="text-muted-foreground"> ({receipt.linesWithoutCost} ohne Preis)</span>}
          </p>
        </div>
        {receipt.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch nichts gescannt.</p>
        ) : (
          <ul className="flex flex-col rounded-lg border border-border bg-card px-4">
            {receipt.lines.map((line) => (
              <li key={line.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0">
                <div className="flex flex-col">
                  <span>{line.nameDe}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      line.unitCostRappen !== null ? `EK ${formatChf(line.unitCostRappen)} ${costBasisLabel(line.unitType)}` : "ohne EK",
                      line.expiryDate ? `MHD ${formatDateOnly(parseDateOnly(line.expiryDate) as Date)}` : null,
                      line.batchCode ? `Charge ${line.batchCode}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-numeric">{formatPacks(line.quantity, line.packSize, line.unitType)}</span>
                  {open && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 px-3 text-muted-foreground"
                      disabled={pending}
                      onClick={() => run(() => removeReceiptLineAction({ lineId: line.id }))}
                    >
                      Entfernen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <div className="flex flex-wrap items-center gap-3">
          {confirmBook ? (
            <>
              <span className="text-sm">
                {receipt.lines.length} {receipt.lines.length === 1 ? "Position" : "Positionen"} einbuchen?
              </span>
              <Button type="button" className="h-11 px-4" disabled={pending} onClick={book}>
                {pending ? "Wird gebucht …" : "Ja, einbuchen"}
              </Button>
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setConfirmBook(false)}>
                Zurück
              </Button>
            </>
          ) : (
            <>
              <Button type="button" className="h-11 px-4" disabled={pending || receipt.lines.length === 0} onClick={() => setConfirmBook(true)}>
                Lieferung einbuchen
              </Button>
              <Button type="button" variant="ghost" className="h-11 px-4 text-muted-foreground" disabled={pending} onClick={cancel}>
                Lieferung verwerfen
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface LineFormProps {
  product: StockProductView;
  receiptId: string;
  onDone: (message: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

/** One article of the delivery: cartons x content, EK, optional MHD and batch. Enter saves. */
function LineForm({ product, receiptId, onDone, onCancel, onError }: LineFormProps) {
  const [packs, setPacks] = useState("1");
  const [packSize, setPackSize] = useState(qtyToInput(product.packSize, product.unitType));
  const [cost, setCost] = useState(rappenToInput(product.purchasePriceRappen));
  const [expiry, setExpiry] = useState("");
  const [batch, setBatch] = useState("");
  const [saving, setSaving] = useState(false);
  const packsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    packsRef.current?.focus();
    packsRef.current?.select();
  }, []);

  const packCount = /^\d{1,6}$/.test(packs.trim()) ? Number(packs.trim()) : null;
  const size = parseQtyInput(packSize, product.unitType);
  const total = packCount !== null && size !== null && size > 0 ? packCount * size : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (packCount === null || packCount < 1) return onError("Anzahl Karton: bitte eine ganze Zahl ab 1.");
    if (size === null || size < 1) return onError(`${inputUnitLabel(product.unitType)} pro Karton: bitte eine Zahl ab 1.`);
    const unitCostRappen = cost.trim() === "" ? null : parseChfToRappen(cost);
    if (cost.trim() !== "" && unitCostRappen === null) return onError("Einkaufspreis nicht lesbar, z.B. 1.25");
    setSaving(true);
    const result = await addReceiptLineAction({
      receiptId,
      productId: product.id,
      packs: packCount,
      packSize: size,
      unitCostRappen,
      expiryDate: expiry || null,
      batchCode: batch,
    });
    setSaving(false);
    if (!result.ok) return onError(result.message);
    onDone(`${product.nameDe}: ${formatPacks(packCount * size, size, product.unitType)} erfasst`);
  }

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={submit} onKeyDown={handleKey} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <p className="font-medium">
        {product.nameDe}
        {product.archived && <span className="text-destructive"> (gelöscht)</span>}
        <span className="text-sm font-normal text-muted-foreground">
          {" "}
          · Bestand jetzt {product.stockQty === null ? "nicht geführt" : formatStockQty(product.stockQty, product.unitType)}
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Anzahl Karton">
          <input ref={packsRef} value={packs} onChange={(e) => setPacks(e.target.value)} inputMode="numeric" className={cn(inputClass(), "font-numeric")} />
        </Field>
        <Field label={`${inputUnitLabel(product.unitType)} pro Karton`}>
          <input value={packSize} onChange={(e) => setPackSize(e.target.value)} inputMode="decimal" className={cn(inputClass(), "font-numeric")} />
        </Field>
        <Field label={`EK CHF ${costBasisLabel(product.unitType)}, ohne MwSt`}>
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="z.B. 1.25" className={cn(inputClass(), "font-numeric")} />
        </Field>
        <Field label="MHD (freiwillig)">
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputClass()} />
        </Field>
        <Field label="Charge (freiwillig)">
          <input value={batch} onChange={(e) => setBatch(e.target.value)} maxLength={60} className={inputClass()} />
        </Field>
        <div className="flex flex-col justify-end text-sm">
          <span className="text-muted-foreground">Zusammen</span>
          <span className="font-numeric min-h-11 py-2.5 font-medium">{total === null ? "?" : formatStockQty(total, product.unitType)}</span>
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" className="h-11 px-4" disabled={saving}>
          {saving ? "Speichert …" : "Hinzufügen (Enter)"}
        </Button>
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onCancel}>
          Abbrechen (Esc)
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {children}
    </label>
  );
}
