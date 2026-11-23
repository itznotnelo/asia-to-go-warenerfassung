# CLAUDE.md — Asia To Go

Warenerfassung für einen Asia-Lebensmittelladen in Schaffhausen (CH).
Die Datenbank dieser App wird später **unverändert** zum Webshop-Backend.
Jede Schema-Entscheidung ist deshalb eine Shop-Entscheidung.

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
8. **`appId` in `electron-builder.config.js` nie wieder ändern.** NSIS bildet
   daraus den Eintrag in «Apps & Features», Installationsordner und Daten
   hängen aber am `productName`. Ein neuer `appId` (so passiert in 0.1.4)
   erzeugt einen zweiten Eintrag auf denselben Ordner; dessen «Deinstallieren»
   entfernt die laufende App. Aufräumen: `build/installer.nsh`.
   `productName` ebenfalls nicht ändern (Daten liegen unter
   `%APPDATA%\Asia To Go`).

## Konventionen

- Dateien: `kebab-case.ts`, React-Komponenten `PascalCase.tsx`
- Server-Logik in `lib/`, nie in Route Handlers ausformuliert
- Externe API-Aufrufe ausschliesslich server-seitig
- Deutsche UI-Texte, Schweizer Schreibweise (`ss`, nicht `ß`)
- Code-Kommentare und Commit-Messages auf Englisch
- Keine `any`. Kein `@ts-ignore` ohne Begründung im Kommentar.

## Tests

Pflicht für: Grundpreis-Berechnung, EAN-Prüfziffer, OFF-Mapping,
MwSt-Zuordnung, Scanner-Buffer-Logik. Alles andere nach Ermessen.

## Lager (seit v0.3)

- Jede Bestandsänderung ist eine `StockMovement`-Zeile (append-only, Rückgängig
  = Gegenbuchung mit `reversesId`). Nur über `bookMovement()` in
  `lib/stock/ledger.ts` buchen, immer in einer Transaktion.
- `Product.stockQty` ist der Cache: `null` = kein Bestand geführt, sonst
  `stockQty = SUM(StockMovement.quantity)` (Test:
  `lib/stock/ledger.integration.test.ts`, läuft gegen echtes Postgres).
- Mengen sind `Int` in der Lager-Einheit (`lib/stock/units.ts`): Stück, bei
  Offenware Gramm/Milliliter. Einkaufspreise (EK) in Rappen pro Stück/kg/l,
  ohne MwSt. Marge wird berechnet, nie gespeichert (`lib/stock/margin.ts`).
- Mit Bestand ist `isAvailable` abgeleitet (Bestand > Sicherheitsbestand,
  `lib/stock/availability.ts`) und wird bei jeder Buchung mitgeschrieben;
  ohne Bestand bleibt es das manuelle Häkchen. Der Shop-Payload bleibt gleich,
  `stockQty` geht nicht an den Shop.
- Kassen-Import ist vorbereitet, nicht gebaut: `docs/kassen-anbindung.md`.

## Was diese App NICHT ist

- kein Kassensystem (Ladenverkäufe werden gescannt oder später aus der Kasse importiert)
- keine Multi-User-App, kein Rollenkonzept, keine Benutzer pro Buchung
- nicht öffentlich erreichbar — läuft im lokalen Netz
- verschickt nie selbst Bestellungen an Lieferanten (Text kopieren, Inhaber sendet)
