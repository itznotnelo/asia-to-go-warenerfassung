# Kassen-Anbindung (noch nicht gebaut)

Stand v0.3: Ladenverkäufe werden von Hand unter Lager, «Verkauf erfassen»
gebucht (StockMovement `sale_shop`). Sobald die Kasse ihre Verkäufe
exportieren kann, sollen sie automatisch kommen. Dieses Dokument hält fest,
wie das andocken soll, damit niemand das Lager umbauen muss.

## Der Haken im Code

- Jeder verkaufte Artikel wird eine Buchung über `bookMovement()` in
  `lib/stock/ledger.ts` mit `type: "sale_shop"` und negativer Menge, in einer
  Transaktion pro Bon (wie `bookWebOrderSales()` in `lib/stock/web-orders.ts`
  für Webshop-Bestellungen).
- Artikel ohne Bestandsführung (`stockQty` null) werden übersprungen, genau
  wie bei Webshop-Bestellungen.
- Doppelt-Import verhindern: eine Tabelle `TillReceipt` (Bon-ID der Kasse als
  Primärschlüssel, Zeitpunkt, Total in Rappen) analog `ShopOrder`, und
  `StockMovement` bekommt dafür einen Link (`tillReceiptId`). Ist der Bon schon
  da, wird nichts gebucht. Das ist eine Schemaänderung: `prisma migrate dev`.
- Stornos/Retouren an der Kasse: eigene Bon-Zeilen mit positiver Menge, gebucht
  als `sale_shop` mit `reversesId`, falls die Kasse den Original-Bon nennt,
  sonst als normale Gegenbuchung.
- Externe Daten immer durch Zod (harte Regel 4), Bon für Bon, damit ein
  kaputter Bon die anderen nicht aufhält (wie `lib/sync/order-schema.ts`).

## Welche Daten die Kasse liefern muss

Pro Bon:

| Feld | Wozu | Pflicht |
| --- | --- | --- |
| Bon-ID, eindeutig und stabil | Doppelt-Import verhindern | ja |
| Zeitpunkt mit Zeitzone | Buchungsdatum, Inventarliste per Stichtag | ja |
| Total in Rappen (oder CHF mit 2 Stellen) | Kontrolle Summe der Zeilen | ja |
| Storno-Kennzeichen / Original-Bon-ID | Rückbuchung | wenn vorhanden |

Pro Zeile:

| Feld | Wozu | Pflicht |
| --- | --- | --- |
| EAN (oder unsere SKU ASIA-xxxxx bzw. PLU) | Artikel finden | ja |
| Menge (Stück, oder Gramm bei Offenverkauf) | Bestand | ja |
| Einzelpreis und Zeilentotal | Kontrolle, später Umsatz pro Artikel | wünschenswert |
| MwSt-Satz | Kontrolle gegen den Artikel | wünschenswert |

Lieferweg, in dieser Reihenfolge bevorzugt: API der Kasse (Pull alle paar
Minuten, wie der Webshop-Sync) > automatischer CSV-Export in einen Ordner >
CSV von Hand hochladen. Die App bleibt im lokalen Netz, also kein Webhook von
aussen.

## Offene Frage an den Inhaber

Welche Kasse hat der Laden (Hersteller, Modell, Software), und kann sie
Verkäufe pro Artikel mit EAN exportieren? Davon hängt ab, welcher Lieferweg
geht.
