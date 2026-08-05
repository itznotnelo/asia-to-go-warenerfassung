---
name: swiss-food-compliance
description: Schweizer Vorgaben für Lebensmittel-Onlineverkauf im Code korrekt umsetzen — MwSt-Sätze 2.6/8.1 Prozent, Grundpreis nach Preisbekanntgabeverordnung, die 14 deklarationspflichtigen Allergene, Pflichtangaben und Rundung auf 5 Rappen. Diese Skill nutzen bei Preisberechnung, MwSt-Zuordnung, Allergen-Feldern, Produktanzeige oder Checkout.
---

# Schweizer Vorgaben umsetzen

> Technische Umsetzungshilfe, keine Rechtsberatung. Sortimentsspezifische Fragen
> (Importetiketten, Bewilligungen) mit dem Kantonalen Labor Schaffhausen klären;
> AGB und Datenschutzerklärung juristisch prüfen lassen.

## Mehrwertsteuer

Zwei Sätze sind relevant:

| Satz | Gilt für |
|---|---|
| **2.6 %** | Lebensmittel und alkoholfreie Getränke (reduzierter Satz) |
| **8.1 %** | Alkoholische Getränke, Tabak, Non-Food: Geschirr, Kochutensilien, Kosmetik, Reinigungsmittel, Zeitschriften |

Umsetzung:
- `vatRate` gehört an den **Artikel**, nicht an die Kategorie. Ein Asia-Sortiment
  mischt Food und Non-Food quer über die Kategorien.
- Default 2.6 %, aber bei Kategorien `Non-Food` und `Alkohol` im Formular
  automatisch 8.1 % vorschlagen und den Nutzer bestätigen lassen.
- **Preise werden inkl. MwSt angezeigt und gespeichert.** Der Steueranteil wird
  für Beleg und Buchhaltung herausgerechnet, nicht aufgeschlagen.
- Auf dem Beleg pro Satz getrennt ausweisen: Nettobetrag, Steuersatz, Steuerbetrag.

```ts
// Steueranteil aus Bruttopreis
const vatRappen = Math.round(grossRappen - grossRappen / (1 + rate / 100));
```

Achtung bei Konsum vor Ort: dort gilt 8.1 %. Für den reinen Ladenverkauf und
Lieferung nicht relevant, aber im Datenmodell nicht ausschliessen.

## Grundpreis (Preisbekanntgabeverordnung)

Bei Waren, die nach Gewicht oder Volumen abgegeben werden, muss neben dem
Verkaufspreis der **Preis pro Vergleichseinheit** stehen.

Regeln für die Umrechnung:
- feste Ware → pro **kg** (bei Kleinmengen unter 100 g auch pro 100 g üblich)
- flüssige Ware → pro **Liter**
- Stückware ohne Gewichtsangabe → kein Grundpreis nötig

```ts
// contentUnit g/kg → CHF/kg, ml/l → CHF/l
calcUnitPrice(priceRappen, contentAmount, contentUnit)
  → { valueRappen, unit: 'kg' | 'l' } | null
```

Gibt `null` zurück, wenn Angaben fehlen — die UI zeigt dann nichts an, statt
etwas zu erfinden. Diese Funktion braucht Unit-Tests, sie läuft später auf jeder
Shop-Seite.

## Rundung auf 5 Rappen

Barzahlung kennt keine 1- und 2-Rappen-Stücke. Nur die **Endsumme** wird auf
5 Rappen gerundet, nicht die Einzelpositionen:

```ts
const roundTo5 = (rappen: number) => Math.round(rappen / 5) * 5;
```

Bei Kartenzahlung/TWINT ist die Rundung nicht nötig — für den Kunden ist es aber
weniger verwirrend, einheitlich zu runden.

## Die 14 deklarationspflichtigen Allergene

Kanonische Liste für das `allergens`-Feld (englische Keys, deutsche Labels in der UI):

| Key | Label DE |
|---|---|
| `gluten` | Glutenhaltiges Getreide |
| `crustaceans` | Krebstiere |
| `eggs` | Eier |
| `fish` | Fische |
| `peanuts` | Erdnüsse |
| `soybeans` | Soja |
| `milk` | Milch (inkl. Laktose) |
| `nuts` | Schalenfrüchte / Nüsse |
| `celery` | Sellerie |
| `mustard` | Senf |
| `sesame` | Sesam |
| `sulphites` | Schwefeldioxid und Sulfite |
| `lupin` | Lupinen |
| `molluscs` | Weichtiere |

Für ein Asia-Sortiment besonders häufig und leicht übersehen: **Soja** (fast alle
Saucen), **Gluten** (Sojasauce, Nudeln, Seitan), **Fisch** (Fischsauce,
Austernsauce, Garnelenpaste), **Sesam**, **Erdnüsse**, **Sulfite** (Trockenfrüchte,
getrocknete Pilze). Wenn das Formular bei einer Sauce keine Allergene zeigt, ist
das ein Warnsignal, kein Erfolg.

`traces` (Spuren) getrennt von `allergens` speichern — rechtlich und für den
Kunden ist das ein Unterschied.

## Pflichtangaben online

Vor Kaufabschluss müssen für jeden Artikel sichtbar sein:
Sachbezeichnung · Zutatenverzeichnis · Allergene (hervorgehoben) · Nettomenge ·
Preis inkl. MwSt · Grundpreis · Herkunftsland wo vorgeschrieben ·
Produzent/Importeur.

Deshalb im Datenmodell das Flag `dataComplete`: ein Artikel darf erst im Shop
erscheinen, wenn `nameDe`, `priceRappen`, `contentAmount`, `contentUnit`,
`ingredientsDe`, `allergens` (geprüft) und mindestens ein Bild vorhanden sind.
Die Erfassungs-App darf unvollständige Artikel speichern — der Shop darf sie
nicht anzeigen.

## Lagerung und Kühlkette

`storageType`: `ambient` | `chilled` | `frozen`.
Relevant später für Lieferfenster, Verpackung und den Ausschluss vom Postversand.
Feld von Anfang an führen, auch wenn Phase 1 es noch nicht auswertet.

## Formatierung

- Währung: `CHF 4.20` (Punkt als Dezimaltrennzeichen)
- Tausender: Apostroph → `CHF 1'250.00`
- Datum: `04.08.2026`
- Schreibweise: Schweizer Hochdeutsch, **`ss` statt `ß`**
