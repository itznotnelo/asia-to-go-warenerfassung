"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MessageBox } from "@/components/stock/message-box";
import { MovementTable } from "@/components/stock/movement-table";
import { inputClass } from "@/lib/input-class";
import { formatChf, parseChfToRappen } from "@/lib/pricing";
import { formatBasisPoints } from "@/lib/stock/margin";
import { formatDateOnly, parseDateOnly } from "@/lib/stock/dates";
import { expiryText } from "@/lib/stock/lots";
import { WASTE_REASONS, wasteReasonLabel, type WasteReason } from "@/lib/stock/movement-rules";
import { costBasisLabel, formatPacks, formatStockQty, inputUnitLabel, parseQtyInput, qtyToInput } from "@/lib/stock/units";
import type { ProductStockCard } from "@/lib/stock/queries";
import { cn } from "@/lib/utils";
import { bookProductMovementAction, saveProductStockSettingsAction } from "@/app/stock/actions";

type Mode = "correction" | "waste" | "return" | "manual" | null;

const MODE_LABEL: Record<Exclude<Mode, null>, string> = {
  correction: "Bestand korrigieren",
  waste: "Abschreiben",
  return: "Retour an Lieferant",
  manual: "Andere Buchung",
};

function rappenInput(rappen: number | null): string {
  return rappen === null ? "" : (rappen / 100).toFixed(2);
}

/** "Lager" block on the article page: stock, settings, margin, lots (MHD) and the movement history. */
export function StockCard({ card, suppliers }: { card: ProductStockCard; suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const unit = card.unitType;

  function done(text: string) {
    setMode(null);
    setMessage({ tone: "ok", text });
    router.refresh();
  }

  return (
    <section id="lager" className="flex scroll-mt-4 flex-col gap-5 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Lager</h2>
          {card.tracked ? (
            <p className={cn("font-numeric text-3xl font-semibold", (card.stockQty ?? 0) < 0 && "text-destructive")}>
              {formatStockQty(card.stockQty ?? 0, unit)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Für diesen Artikel wird kein Bestand geführt. Der Webshop folgt dem Häkchen «Verfügbar».</p>
          )}
          {card.tracked && (card.stockQty ?? 0) < 0 && (
            <p className="text-sm text-destructive">Bestand unter null: bitte nachzählen und mit «Bestand korrigieren» richtigstellen.</p>
          )}
          {card.tracked && card.packSize > 1 && (card.stockQty ?? 0) >= card.packSize && (
            <p className="text-sm text-muted-foreground">{formatPacks(card.stockQty ?? 0, card.packSize, unit)}</p>
          )}
        </div>
        {card.tracked && (
          <p className="max-w-xs text-sm text-muted-foreground">
            {card.isAvailable ? "Bestand reicht für den Webshop" : "Bestand zu klein für den Webshop"} (nötig: mehr als {formatStockQty(card.safetyBuffer, unit)})
          </p>
        )}
      </div>

      {message && <MessageBox tone={message.tone}>{message.text}</MessageBox>}

      {card.tracked && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODE_LABEL) as Exclude<Mode, null>[]).map((key) => (
              <Button
                key={key}
                type="button"
                variant={mode === key ? "secondary" : "outline"}
                className="h-11 px-4"
                onClick={() => {
                  setMessage(null);
                  setMode(mode === key ? null : key);
                }}
              >
                {MODE_LABEL[key]}
              </Button>
            ))}
          </div>
          {mode && (
            <MovementForm
              key={mode}
              mode={mode}
              card={card}
              suppliers={suppliers}
              onDone={done}
              onError={(text) => setMessage({ tone: "error", text })}
              onCancel={() => setMode(null)}
            />
          )}
        </div>
      )}

      {card.lots.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">Lieferungen am Lager (älteste MHD zuerst)</h3>
          <ul className="flex flex-col text-sm">
            {card.lots.map((lot) => {
              const expiry = lot.expiryDate ? parseDateOnly(lot.expiryDate) : null;
              return (
                <li key={lot.id} className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 border-b border-border py-1.5 last:border-b-0">
                  <span>
                    {expiry ? `MHD ${formatDateOnly(expiry)} (${expiryText(expiry)})` : "ohne MHD"}
                    {lot.batchCode && <span className="text-muted-foreground"> · Charge {lot.batchCode}</span>}
                    {lot.supplierName && <span className="text-muted-foreground"> · {lot.supplierName}</span>}
                    {lot.id === card.sellFirstLotId && <span className="text-primary"> · zuerst verkaufen</span>}
                  </span>
                  <span className="font-numeric">{formatStockQty(lot.remaining, unit)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <MarginLine card={card} />

      <SettingsForm card={card} suppliers={suppliers} onSaved={(text) => done(text)} onError={(text) => setMessage({ tone: "error", text })} />

      {card.movementCount > 0 && (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Letzte Buchungen</h3>
        <MovementTable movements={card.movements} showProduct={false} />
        {card.movementCount > card.movements.length && (
          <a href={`/stock/movements?product=${card.productId}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">
            Alle {card.movementCount} Buchungen ansehen
          </a>
        )}
      </div>
      )}
    </section>
  );
}

function MarginLine({ card }: { card: ProductStockCard }) {
  if (!card.margin) {
    return (
      <p className="text-sm text-muted-foreground">
        Marge: {card.purchasePriceRappen === null ? "Einkaufspreis fehlt (wird beim Wareneingang übernommen oder unten eingetragen)." : "nicht berechenbar."}
      </p>
    );
  }
  const { margin } = card;
  return (
    <p className="text-sm">
      Marge pro {inputUnitLabel(card.unitType)}:{" "}
      <span className={cn("font-numeric font-medium", margin.marginRappen < 0 && "text-destructive")}>
        {formatChf(margin.marginRappen)} ({formatBasisPoints(margin.marginBasisPoints)})
      </span>
      <span className="text-muted-foreground">
        {" "}
        · VK ohne MwSt {formatChf(margin.netSalesRappen)} · EK {formatChf(margin.costRappen)}
      </span>
    </p>
  );
}

interface MovementFormProps {
  mode: Exclude<Mode, null>;
  card: ProductStockCard;
  suppliers: { id: string; name: string }[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}

function MovementForm({ mode, card, suppliers, onDone, onError, onCancel }: MovementFormProps) {
  const unit = card.unitType;
  const [qty, setQty] = useState(mode === "correction" ? qtyToInput(Math.max(0, card.stockQty ?? 0), unit) : "");
  const [reason, setReason] = useState<WasteReason>("damaged");
  const [supplierId, setSupplierId] = useState(card.defaultSupplierId ?? "");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const quantity = parseQtyInput(qty, unit, mode === "manual");
    if (quantity === null || (mode !== "correction" && quantity === 0) || (mode !== "manual" && quantity < 0)) {
      onError(mode === "manual" ? "Menge: z.B. 5 für mehr oder -5 für weniger." : "Bitte eine Menge eingeben.");
      return;
    }
    const input =
      mode === "correction"
        ? { kind: mode, productId: card.productId, countedQty: quantity, note }
        : mode === "waste"
          ? { kind: mode, productId: card.productId, quantity, wasteReason: reason, note }
          : mode === "return"
            ? { kind: mode, productId: card.productId, quantity, supplierId: supplierId || null, note }
            : { kind: mode, productId: card.productId, quantity, note };
    startTransition(async () => {
      const result = await bookProductMovementAction(input);
      if (!result.ok) return onError(result.message);
      onDone(result.data ? `Gebucht. Bestand jetzt ${formatStockQty(result.data.stockAfter, unit)}.` : "Bestand stimmt schon, nichts gebucht.");
    });
  }

  const qtyLabel =
    mode === "correction" ? `Tatsächlich gezählt (${inputUnitLabel(unit)})` : mode === "manual" ? `Menge +/- (${inputUnitLabel(unit)})` : `Menge (${inputUnitLabel(unit)})`;

  return (
    <form onSubmit={submit} onKeyDown={(event) => event.key === "Escape" && onCancel()} className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
      <label className="flex w-40 flex-col gap-1 text-sm">
        {qtyLabel}
        <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="decimal" autoFocus className={cn(inputClass(), "font-numeric")} />
      </label>
      {mode === "waste" && (
        <label className="flex w-44 flex-col gap-1 text-sm">
          Grund
          <select value={reason} onChange={(event) => setReason(event.target.value as WasteReason)} className={inputClass()}>
            {WASTE_REASONS.map((value) => (
              <option key={value} value={value}>
                {wasteReasonLabel(value)}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === "return" && (
        <label className="flex w-52 flex-col gap-1 text-sm">
          Lieferant
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={inputClass()}>
            <option value="">nicht angegeben</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
        {mode === "manual" ? "Warum? *" : "Notiz (freiwillig)"}
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className={inputClass()} />
      </label>
      <Button type="submit" className="h-11 px-4" disabled={pending}>
        {pending ? "Bucht …" : "Buchen"}
      </Button>
      <Button type="button" variant="ghost" className="h-11 px-4" onClick={onCancel}>
        Abbrechen
      </Button>
    </form>
  );
}

interface SettingsFormProps {
  card: ProductStockCard;
  suppliers: { id: string; name: string }[];
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

function SettingsForm({ card, suppliers, onSaved, onError }: SettingsFormProps) {
  const unit = card.unitType;
  const [tracked, setTracked] = useState(card.tracked);
  const [minStock, setMinStock] = useState(card.minStock === null ? "" : qtyToInput(card.minStock, unit));
  const [reorderQty, setReorderQty] = useState(card.reorderQty === null ? "" : qtyToInput(card.reorderQty, unit));
  const [packSize, setPackSize] = useState(qtyToInput(card.packSize, unit));
  const [cost, setCost] = useState(rappenInput(card.purchasePriceRappen));
  const [supplierId, setSupplierId] = useState(card.defaultSupplierId ?? "");
  const [pending, startTransition] = useTransition();

  function optionalQty(text: string, label: string, min: number): number | null | false {
    if (text.trim() === "") return null;
    const value = parseQtyInput(text, unit);
    if (value === null || value < min) {
      onError(`${label}: bitte eine Zahl${min > 0 ? " ab 1" : ""} eingeben oder leer lassen.`);
      return false;
    }
    return value;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const min = optionalQty(minStock, "Meldebestand", 0);
    const reorder = optionalQty(reorderQty, "Bestellmenge", 1);
    const pack = parseQtyInput(packSize, unit);
    if (min === false || reorder === false) return;
    if (pack === null || pack < 1) return onError("Inhalt pro Karton: bitte eine Zahl ab 1.");
    const purchasePriceRappen = cost.trim() === "" ? null : parseChfToRappen(cost);
    if (cost.trim() !== "" && purchasePriceRappen === null) return onError("Einkaufspreis nicht lesbar, z.B. 1.25");
    if (!tracked && card.tracked && !window.confirm("Bestand für diesen Artikel nicht mehr führen? Die Buchungen bleiben gespeichert.")) return;
    startTransition(async () => {
      const result = await saveProductStockSettingsAction({
        productId: card.productId,
        tracked,
        minStock: min,
        reorderQty: reorder,
        packSize: pack,
        purchasePriceRappen,
        defaultSupplierId: supplierId || null,
      });
      if (!result.ok) return onError(result.message);
      onSaved("Lager-Einstellungen gespeichert.");
    });
  }

  return (
    <details className="rounded-lg border border-border">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-sm font-medium">Einstellungen: Bestand, Meldebestand, Einkauf</summary>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border p-3">
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={tracked} onChange={(event) => setTracked(event.target.checked)} className="size-5 accent-primary" />
          Bestand führen (Webshop zeigt den Artikel dann nur, solange genug da ist)
        </label>
        {!card.tracked && tracked && (
          <p className="text-sm text-muted-foreground">Danach den Bestand einmal zählen («Bestand korrigieren» oder Inventur), sonst steht er auf 0.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Meldebestand ({inputUnitLabel(unit)})
            <input value={minStock} onChange={(event) => setMinStock(event.target.value)} inputMode="decimal" placeholder="leer = keiner" className={cn(inputClass(), "font-numeric")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Übliche Bestellmenge ({inputUnitLabel(unit)})
            <input value={reorderQty} onChange={(event) => setReorderQty(event.target.value)} inputMode="decimal" placeholder="leer = automatisch" className={cn(inputClass(), "font-numeric")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {inputUnitLabel(unit)} pro Karton
            <input value={packSize} onChange={(event) => setPackSize(event.target.value)} inputMode="decimal" className={cn(inputClass(), "font-numeric")} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            EK CHF {costBasisLabel(unit)}, ohne MwSt
            <input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" placeholder="z.B. 1.25" className={cn(inputClass(), "font-numeric")} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Standard-Lieferant
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={inputClass()}>
              <option value="">keiner</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <Button type="submit" className="h-11 px-4" disabled={pending}>
            {pending ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </form>
    </details>
  );
}
