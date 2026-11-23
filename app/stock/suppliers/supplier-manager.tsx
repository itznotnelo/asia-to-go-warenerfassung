"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { MessageBox } from "@/components/stock/message-box";
import { inputClass } from "@/lib/input-class";
import type { SupplierView } from "@/lib/stock/suppliers";
import { archiveSupplierAction, saveSupplierAction } from "@/app/stock/actions";

type Draft = Omit<SupplierView, "productCount" | "id"> & { id: string | null };

const EMPTY: Draft = { id: null, name: "", contactName: "", phone: "", email: "", customerNumber: "", notes: "" };

export function SupplierManager({ suppliers }: { suppliers: SupplierView[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(suppliers.length === 0 ? "new" : null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {message && <MessageBox tone="ok">{message}</MessageBox>}
      {editing === "new" ? (
        <SupplierForm
          draft={EMPTY}
          onDone={(text) => {
            setEditing(null);
            setMessage(text);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div>
          <Button type="button" className="h-11 px-4" onClick={() => setEditing("new")}>
            Neuer Lieferant
          </Button>
        </div>
      )}

      {suppliers.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">Noch keine Lieferanten.</p>}

      <ul className="flex flex-col gap-3">
        {suppliers.map((supplier) =>
          editing === supplier.id ? (
            <li key={supplier.id}>
              <SupplierForm
                draft={supplier}
                onDone={(text) => {
                  setEditing(null);
                  setMessage(text);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={supplier.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="text-base font-medium">{supplier.name}</span>
                {supplier.contactName && <span>{supplier.contactName}</span>}
                {(supplier.phone || supplier.email) && (
                  <span className="text-muted-foreground">{[supplier.phone, supplier.email].filter(Boolean).join(" · ")}</span>
                )}
                {supplier.customerNumber && <span className="text-muted-foreground">Unsere Kundennr.: {supplier.customerNumber}</span>}
                {supplier.notes && <span className="whitespace-pre-line text-muted-foreground">{supplier.notes}</span>}
                <span className="text-xs text-muted-foreground">{supplier.productCount} Artikel mit diesem Standard-Lieferanten</span>
              </div>
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setEditing(supplier.id)}>
                Bearbeiten
              </Button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function SupplierForm({ draft, onDone, onCancel }: { draft: Draft; onDone: (message: string) => void; onCancel: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: draft.name,
    contactName: draft.contactName ?? "",
    phone: draft.phone ?? "",
    email: draft.email ?? "",
    customerNumber: draft.customerNumber ?? "",
    notes: draft.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveSupplierAction({ ...values, id: draft.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onDone(`${values.name} gespeichert.`);
    });
  }

  function archive() {
    if (!draft.id) return;
    if (!window.confirm(`${draft.name} entfernen? Alte Lieferungen behalten den Namen.`)) return;
    const id = draft.id;
    startTransition(async () => {
      const result = await archiveSupplierAction(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
      onDone(`${draft.name} entfernt.`);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input value={values.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} className={inputClass()} autoFocus />
        </Field>
        <Field label="Ansprechperson">
          <input value={values.contactName} onChange={(e) => set("contactName", e.target.value)} maxLength={120} className={inputClass()} />
        </Field>
        <Field label="Telefon">
          <input value={values.phone} onChange={(e) => set("phone", e.target.value)} maxLength={60} inputMode="tel" className={inputClass()} />
        </Field>
        <Field label="E-Mail">
          <input value={values.email} onChange={(e) => set("email", e.target.value)} maxLength={200} inputMode="email" className={inputClass()} />
        </Field>
        <Field label="Unsere Kundennummer dort">
          <input value={values.customerNumber} onChange={(e) => set("customerNumber", e.target.value)} maxLength={60} className={inputClass()} />
        </Field>
      </div>
      <Field label="Notizen (z.B. Liefertag, Mindestbestellung)">
        <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={3} className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="h-11 px-4" disabled={pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onCancel}>
          Abbrechen
        </Button>
        {draft.id && (
          <Button type="button" variant="ghost" className="ml-auto h-11 px-4 text-destructive" disabled={pending} onClick={archive}>
            Lieferant entfernen
          </Button>
        )}
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
