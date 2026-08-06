# CLAUDE.md — Asia To Go

Warenerfassung für einen Asia-Lebensmittelladen in Schaffhausen (CH).
Die Datenbank dieser App wird später **unverändert** zum Webshop-Backend.
Jede Schema-Entscheidung ist deshalb eine Shop-Entscheidung.

## Stack

Next.js 15 (App Router) · TypeScript strict · PostgreSQL 16 (Docker) · Prisma ·
Tailwind v4 · shadcn/ui · Zod · sharp · Vitest · pnpm

## Harte Regeln

1. **Geld ist `Int` in Rappen.** Niemals Float, niemals `number` für CHF.
   Formatierung nur an der UI-Grenze über `formatChf()`.
2. **MwSt gehört zum Artikel**, nicht zur Kategorie. Default 2.6 %,
   8.1 % bei Alkohol, Non-Food, Kosmetik, Geschirr. Siehe Skill
   `swiss-food-compliance`.
3. **Grundpreis wird berechnet, nie gespeichert.** Einzige Quelle:
   `lib/pricing.ts` → `calcUnitPrice()`.
4. **Externe Daten immer durch Zod**, besonders Open Food Facts.
   OFF-Felder fehlen häufig oder haben unerwartete Typen.
5. **Allergene niemals automatisch als geprüft markieren.** Daten aus OFF oder
   KI-Extraktion sind Vorschläge und müssen vom Nutzer bestätigt werden.
6. **`nameOriginal` ist kein Nice-to-have.** Kundschaft sucht nach dem
   chinesischen/thailändischen Namen. Immer mitführen, immer durchsuchbar.
7. Keine Migration von Hand editieren. Schema ändern → `prisma migrate dev`.

## Konventionen

- Dateien: `kebab-case.ts`, React-Komponenten `PascalCase.tsx`
- Server-Logik in `lib/`, nie in Route Handlers ausformuliert
- Externe API-Aufrufe ausschliesslich server-seitig
- Deutsche UI-Texte, Schweizer Schreibweise (`ss`, nicht `ß`)
- Code-Kommentare und Commit-Messages auf Englisch
- Keine `any`. Kein `@ts-ignore` ohne Begründung im Kommentar.

## Verzeichnisse

```
app/                Next.js Routes
  scan/             Hauptseite (Erfassung)
  products/         Liste + Detail
  dashboard/        Fortschritt
  api/              Route Handlers
components/         UI
lib/
  pricing.ts        Grundpreis, MwSt, Formatierung
  barcode.ts        EAN-Validierung, Prüfziffer
  openfoodfacts/    Client, Zod-Schemas, Mapping
  images.ts         Download, Resize, WebP
prisma/             schema.prisma, migrations, seed.ts
data/images/        lokale Produktbilder (nicht in Git)
```

## Tests

Pflicht für: Grundpreis-Berechnung, EAN-Prüfziffer, OFF-Mapping,
MwSt-Zuordnung, Scanner-Buffer-Logik. Alles andere nach Ermessen.

## Was diese App NICHT ist

- kein Kassensystem
- keine echte Bestandsführung in Phase 1 (`stockQty` bleibt nullable)
- keine Multi-User-App, kein Rollenkonzept
- nicht öffentlich erreichbar — läuft im lokalen Netz
