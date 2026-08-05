/** Gemeinsame Feld-Optik für Formulare — plain module, damit auch Server Components (z.B. das GET-Filterformular) sie direkt aufrufen können, nicht nur "use client"-Komponenten. */
export function inputClass(): string {
  return "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
}
