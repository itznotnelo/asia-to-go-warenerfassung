# Asia To Go

Warenerfassung für einen Asia-Lebensmittelladen in Schaffhausen. Details zu
Stack, harten Regeln und Konventionen stehen in [`CLAUDE.md`](./CLAUDE.md).

## Setup (5 Minuten)

Voraussetzungen: Node 20+, pnpm, Docker Desktop.

```bash
pnpm install

# Postgres starten
docker compose up -d

# .env anlegen (Default passt zu docker-compose.yml)
cp .env.example .env

# Schema anwenden + Beispieldaten einspielen
npx prisma migrate dev

# Entwicklungsserver starten
pnpm dev
```

Öffne [http://localhost:3000](http://localhost:3000) — leitet direkt auf `/scan` weiter.

`prisma migrate dev` führt `prisma/seed.ts` automatisch nach der ersten
Migration aus (Kategorie-Baum + ein paar Beispielprodukte). Erneut seeden,
ohne zu migrieren:

```bash
pnpm db:seed
```

## Seiten

- **`/scan`** — Hauptseite. Barcode scannen (USB-Handscanner oder manuelles
  Eingabefeld) → Treffer in der eigenen DB zeigt die Schnellansicht
  (Preis + Verfügbarkeit, unter 5 Sekunden erledigt), sonst Open-Food-Facts-
  Lookup mit vorausgefülltem Formular oder leerem Formular bei Fehltreffer.
  Tastatur: `Enter` speichern, `Esc` abbrechen, `Ctrl+D` letzten Artikel
  duplizieren (Variante derselben Marke), `Ctrl+K` Artikel suchen.
- **`/products`** — Artikelliste mit Suche, Filtern (Kategorie, Lagerung,
  Quelle, Vollständigkeit), Inline-Bearbeitung von Preis/Verfügbarkeit und
  Bulk-Aktionen. **`/products/[id]`** ist die volle Detailseite inkl. Löschen.
- **`/dashboard`** — Fortschritt: erfasste Artikel, Anteil `dataComplete`,
  OFF-Trefferquote aus dem `ScanLog`, Artikel pro Kategorie, Arbeitsvorrat der
  unvollständigen Artikel. Von dort aus JSON-/CSV-Export aller Artikel
  (`/api/export?format=json|csv`) für Backup und externe Weiterverarbeitung.

Bildverwaltung (Upload, Drag-Reorder) und ein Änderungsverlauf auf der
Detailseite sind noch nicht angebunden — deshalb bleibt `dataComplete`
aktuell bei jedem Artikel `false`.

## Weitere Befehle

```bash
pnpm test          # Vitest einmalig
pnpm test:watch    # Vitest im Watch-Modus
pnpm lint          # ESLint
npx prisma studio  # DB im Browser inspizieren
```

## Struktur

Siehe [`CLAUDE.md`](./CLAUDE.md#verzeichnisse) für das Verzeichnis-Layout und
die harten Regeln (Geld als Rappen-`Int`, Grundpreis nur berechnet nie
gespeichert, `dataComplete`-Flag, etc.).
