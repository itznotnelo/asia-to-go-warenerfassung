"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/lib/input-class";
import { createStocktakeAction } from "@/app/stock/actions";

export function NewStocktakeForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const category = categories.find((c) => c.id === categoryId);
    startTransition(async () => {
      const result = await createStocktakeAction({ title: title.trim() || category?.name || "", categoryId: categoryId || null });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/stock/counts/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name, z.B. «Regal 3» oder «Jahresinventur 2026»
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className={inputClass()} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kategorie (freiwillig)
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass()}>
            <option value="">Alle</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" className="h-11 px-4" disabled={pending}>
          {pending ? "Wird angelegt …" : "Zählung starten"}
        </Button>
      </div>
    </form>
  );
}
