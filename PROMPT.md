# Build-Prompt: Warenerfassungs-App "Asia Shop Schaffhausen"

> Diesen Text komplett in Claude Code einfügen (erste Session, leeres Repo).
> `CLAUDE.md` und `.claude/skills/` vorher ins Repo kopieren.

---

Baue eine lokale Desktop-Web-App zur Erfassung von Lebensmittel-Artikeln für einen
Asia-Lebensmittelladen in Schaffhausen (Schweiz). Die Datenbank dieser App wird
später **unverändert** als Grundlage für den Webshop dienen — das Datenmodell ist
deshalb der wichtigste Teil dieses Projekts.

## Kontext

- Betrieb: kleiner Asia-Lebensmittelladen, Sortiment ca. 500–1500 Artikel
- Erfassung erfolgt am Rechner mit einem **USB-Handscanner** (Keyboard-Wedge)
- Zielzeit pro Artikel: **unter 45 Sekunden**, bei OFF-Treffer unter 15 Sekunden
- Nutzer: 1–2 Personen, kein technisches Publikum, deutschsprachig
- Läuft im lokalen Netz (Homelab), kein öffentlicher Zugriff nötig

## Tech-Stack (verbindlich)

- Next.js 15, App Router, TypeScript strict
- PostgreSQL 16 in Docker + Prisma ORM
- Tailwind CSS v4 + shadcn/ui
- `sharp` für Bildverarbeitung
- Zod für alle Validierung (Formulare **und** externe API-Responses)
- Docker Compose für Postgres + optional die App selbst

Postgres statt SQLite, obwohl lokal — damit der spätere Webshop dieselbe Engine
nutzt und keine Migration nötig wird.

---

## Phase 1 — Fundament

### 1.1 Datenmodell (Prisma)

Erstelle das Schema. Diese Felder sind Pflicht und dürfen nicht wegoptimiert werden:

**Product**
| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | cuid | |
| `ean` | String? @unique | 8/12/13/14-stellig, auch Artikel ohne Barcode möglich |
| `sku` | String @unique | intern generiert, z.B. `ASIA-00042` |
| `nameDe` | String | Pflicht |
| `nameOriginal` | String? | chin./thai/viet. Originalname — Kunden suchen danach! |
| `nameEn` | String? | |
| `brand` | String? | |
| `originCountry` | String? | ISO-2 |
| `categoryId` | FK | Kategorie-Baum |
| `priceRappen` | Int | **Preise immer als Integer in Rappen**, nie Float |
| `vatRate` | Decimal(3,1) | 2.6 oder 8.1 — Default 2.6 |
| `unitType` | String | `piece` \| `weight` \| `volume` |
| `contentAmount` | Decimal? | z.B. 500 |
| `contentUnit` | String? | `g` \| `kg` \| `ml` \| `l` \| `stk` |
| `storageType` | String | `ambient` \| `chilled` \| `frozen` |
| `ingredientsDe` | String? | |
| `allergens` | String[] | normalisiert, siehe Skill |
| `nutrition` | Json? | pro 100 g/ml |
| `isAvailable` | Boolean | Default true |
| `stockQty` | Int? | nullable — Phase 1 ohne echte Bestandsführung |
| `dataSource` | String | `openfoodfacts` \| `manual` \| `ai_extracted` |
| `dataComplete` | Boolean | berechnet: alle Shop-Pflichtfelder gesetzt? |
| `notes` | String? | interne Notiz |
| `createdAt` / `updatedAt` | | |

**Weitere Modelle:** `Category` (selbstreferenzierend, `parentId`), `ProductImage`
(`productId`, `type`: `front`\|`ingredients`\|`nutrition`\|`other`, `path`, `width`,
`height`, `sortOrder`, `sourceAttribution`), `ScanLog` (jeder Scan mit Ergebnis —
für Statistik über die OFF-Trefferquote).

**Grundpreis** (CHF pro kg/l) wird **nicht** gespeichert, sondern aus
`priceRappen`, `contentAmount` und `contentUnit` berechnet. Schreibe dafür eine
reine Funktion `calcUnitPrice()` mit Unit-Tests — sie wird im Shop wiederverwendet.

Lege Seed-Daten an: ein sinnvoller Kategorie-Baum für ein Asia-Sortiment
(Saucen & Würzmittel, Nudeln & Reis, Konserven, Tiefkühl, Snacks & Süsses,
Getränke, Frische, Non-Food) mit je 2–4 Unterkategorien.

### 1.2 Barcode-Eingabe

Der Scanner verhält sich wie eine Tastatur: er tippt die Ziffern sehr schnell und
sendet `Enter`. Implementiere einen `useBarcodeScanner()` Hook:

- globaler `keydown`-Listener auf `document`, **kein** fokussiertes Input nötig
- Zeichen puffern, `Enter` schliesst ab
- Scanner von manuellem Tippen unterscheiden: Zeitabstand zwischen Zeichen
  < 50 ms → Scanner. Bei > 300 ms Pause Puffer verwerfen.
- Listener pausieren, während ein Textfeld fokussiert ist (`isEditableTarget()`)
- validieren: nur Ziffern, Länge 8/12/13/14, **EAN-13-Prüfziffer verifizieren**
- akustisches Feedback: kurzer Ton bei Erfolg, tiefer Doppelton bei Fehler
  (Web Audio API, keine Sounddateien)

Zusätzlich ein manuelles Eingabefeld als Fallback für unlesbare Barcodes.

### 1.3 Open Food Facts Anbindung

Details, Endpunkte und Feldnamen stehen im Skill `openfoodfacts`. **Lies diesen
Skill, bevor du den Client schreibst**, und verifiziere die Response-Struktur
gegen einen echten Testabruf, statt sie anzunehmen.

Kernpunkte:
- Server-seitiger Route Handler, nie direkt aus dem Browser
- eigener `User-Agent` ist von OFF vorgeschrieben
- Response mit Zod parsen — OFF-Felder sind oft leer, falsch typisiert oder fehlen
- **Response 30 Tage in der DB cachen** (`OffCache`-Tabelle), damit Re-Scans und
  Entwicklung keine unnötigen Requests erzeugen
- Bilder herunterladen und lokal speichern, nicht hotlinken
- Mapping OFF → eigenes Schema in eine eigene, getestete Datei

**Wichtig:** Rechne mit einer Trefferquote von nur 20–50 %, weil OFF bei
asiatischen Importwaren dünn ist. Die manuelle Erfassung ist der Hauptpfad, nicht
die Ausnahme. Baue die UI so, dass ein Miss keine Sackgasse ist, sondern nahtlos
ins leere Formular führt.

---

## Phase 2 — Die Oberfläche

### Design-Richtung

Das ist **kein** generisches Admin-Panel. Es ist ein Werkzeug, das jemand
stundenlang am Stück bedient, oft stehend, mit einem Scanner in der Hand.
Gestalte es wie ein Arbeitsterminal: dunkel, hoher Kontrast, ruhig, präzise.

- **Dunkles Theme**, warmes Neutral-Grau als Basis (nicht Blau-Grau, nicht reines
  Schwarz). Ein einziger kräftiger Akzent für Scan-Feedback.
- **Typografie:** Barcodes, SKUs und Zahlen in einer echten Monospace mit
  Charakter. Fliesstext in einer klar lesbaren Grotesk. Keine Systemfonts,
  kein Inter, kein Roboto.
- **Zustand ist wichtiger als Dekoration.** Der Scan-Status (bereit / lädt /
  Treffer / kein Treffer) muss aus 2 m Entfernung erkennbar sein — grosse Fläche,
  Farbe, kurze Animation.
- Grosszügige Zeilenhöhen und Touch-Targets, dichte Informationsanordnung ohne
  Gedränge.
- Sparsame, gezielte Motion: Statuswechsel und Speicher-Bestätigung. Sonst nichts.

Lies den Skill `frontend-design`, falls vorhanden, und triff eine eigene,
konsequente ästhetische Entscheidung — nicht die naheliegendste.

### Seiten

**`/scan` — Hauptseite, Startseite**
Der gesamte Workflow auf einer Seite, ohne Navigation:
1. Grosser Scan-Bereich mit Statusanzeige, immer aufnahmebereit
2. Nach Scan: existiert der Artikel bereits? → Schnellansicht mit Preis-Korrektur
   und „Verfügbar"-Toggle, in unter 5 Sekunden erledigt
3. Neuer Artikel + OFF-Treffer → Formular vorausgefüllt, übernommene Felder
   sichtbar markiert (der Nutzer muss erkennen, was von OFF kam und was er selbst
   eingetragen hat)
4. Neuer Artikel ohne Treffer → leeres Formular, Fokus direkt auf `nameDe`
5. Speichern → Bestätigung, Formular leert sich, Scanner sofort wieder bereit

**Vollständig per Tastatur bedienbar.** Keine Maus nötig:
`Enter` speichern und weiter · `Esc` abbrechen · `Tab` durchs Formular ·
`Ctrl+D` letzten Artikel duplizieren (für Varianten derselben Marke) ·
`Ctrl+K` Suche. Blende die Shortcuts dezent am unteren Rand ein.

**`/products` — Artikelliste**
Tabelle mit Suche (auch über `nameOriginal`), Filter nach Kategorie, Lagerart,
Datenquelle und `dataComplete`. Inline-Bearbeitung von Preis und Verfügbarkeit.
Bulk-Aktionen: Kategorie setzen, MwSt setzen, Verfügbarkeit umschalten.

**`/products/[id]` — Detail/Bearbeiten**
Alle Felder, Bildverwaltung mit Drag-Reorder, Änderungsverlauf falls einfach.

**`/dashboard` — Fortschritt**
Erfasste Artikel gesamt · davon `dataComplete` · OFF-Trefferquote aus `ScanLog` ·
Artikel pro Kategorie · Liste unvollständiger Artikel als Arbeitsvorrat.

---

## Phase 3 — Beschleuniger

Erst bauen, wenn Phase 1–2 stabil läuft:

1. **Foto-Extraktion.** Foto der Verpackungsrückseite hochladen → Anthropic API
   mit Bild-Input → Zutatenliste, Allergene und Nährwerte als strukturiertes JSON
   zurück → Formular vorausfüllen, Felder als `ai_extracted` markieren und zur
   Prüfung hervorheben. Das ist der grösste Zeitgewinn bei Artikeln ohne
   OFF-Eintrag. **Nie ungeprüft übernehmen** — Allergene sind rechtlich heikel.
2. **Zwei-Pass-Modus.** Schnellerfassung: nur Scan + Preis + Foto, Artikel wird
   als unvollständig markiert. Details später am Schreibtisch aus dem Arbeitsvorrat.
3. **Export.** JSON und CSV für Backup und externe Weiterverarbeitung.
4. **Backup.** `pg_dump` per Cron ins Homelab, Bilder-Ordner mit dazu.

---

## Qualitätsanforderungen

- **Preise nie als Float.** Integer in Rappen, überall.
- Alle externen Daten (OFF, Formulare, Uploads) durch Zod.
- Vitest für: Grundpreis-Berechnung, EAN-Prüfziffer, OFF-Mapping,
  MwSt-Zuordnung, Scanner-Buffer-Logik.
- Fehler sichtbar machen statt verschlucken — offline, OFF nicht erreichbar,
  Bild-Download fehlgeschlagen: jeweils eine klare deutsche Meldung.
- Alle Texte in der UI auf Deutsch (Schweizer Schreibweise: `ss` statt `ß`).
- `README.md` mit Setup in unter 5 Minuten: `docker compose up -d`,
  `pnpm install`, `pnpm prisma migrate dev`, `pnpm dev`.

## Vorgehen

Arbeite in dieser Reihenfolge und halte nach jedem Punkt an, damit ich prüfen kann:

1. Projekt-Setup, Docker Compose, Prisma-Schema, Migration, Seed
2. OFF-Client mit Mapping und Tests (noch ohne UI)
3. Scanner-Hook mit Tests
4. `/scan` inkl. Design-System
5. `/products` und Detailseite
6. `/dashboard`, Export, README

Stelle Rückfragen, bevor du bei unklaren Anforderungen rätst. Wenn du eine
Annahme treffen musst, schreibe sie explizit in die Antwort.
