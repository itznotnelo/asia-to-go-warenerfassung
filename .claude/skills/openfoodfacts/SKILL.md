---
name: openfoodfacts
description: Open Food Facts API korrekt anbinden — Endpunkte, Pflicht-Header, Feld-Mapping, Allergen-Tags, Nährwerte, Bilder, Caching und Lizenz. Diese Skill nutzen, sobald Produktdaten per Barcode/EAN von Open Food Facts geholt, gemappt oder gecacht werden, oder wenn OFF-Antworten validiert werden müssen.
---

# Open Food Facts anbinden

## Vor dem Schreiben: verifizieren

Die OFF-API ändert sich. **Nicht auf Gedächtnis verlassen** — einen echten
Testabruf mit einem bekannten Barcode machen und die tatsächliche Struktur
ansehen, bevor Schemas geschrieben werden. Offizielle Doku:
`https://openfoodfacts.github.io/openfoodfacts-server/api/`

## Endpunkt

```
GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json
```

Mit `?fields=` nur die benötigten Felder anfordern — die volle Antwort ist
mehrere hundert KB gross.

Nützliche Felder:
`code, product_name, product_name_de, generic_name_de, brands, quantity,
categories_tags, countries_tags, image_front_url, image_ingredients_url,
image_nutrition_url, ingredients_text_de, ingredients_text, allergens_tags,
traces_tags, nutriments, labels_tags, nova_group, ecoscore_grade`

## Pflicht-Header

OFF verlangt einen aussagekräftigen `User-Agent`. Ohne ihn droht Blockierung:

```
User-Agent: AsiaToGo/1.0 (kontakt@deine-domain.ch)
```

Rate Limit für Produktabrufe liegt im Bereich von etwa 100 Requests/Minute —
für Handerfassung unkritisch, aber Caching ist trotzdem Pflicht.

## Antwort robust behandeln

- Bei unbekanntem Produkt kann sowohl HTTP 404 als auch HTTP 200 mit leerem
  Ergebnis kommen. **Immer auf Vorhandensein von `product` prüfen**, nicht auf
  ein einzelnes Statusfeld.
- Praktisch jedes Feld kann fehlen, leer (`""`) oder falsch typisiert sein
  (Zahlen als String). Zod-Schema durchgehend mit `.optional()` und
  Coercion aufbauen.
- Netzwerkfehler und Timeout (5 s) sauber abfangen → UI zeigt „kein Treffer",
  nicht einen Crash.

## Feld-Mapping nach eigenem Schema

| OFF | eigenes Feld | Hinweis |
|---|---|---|
| `product_name_de` → `product_name` | `nameDe` | Fallback-Kette, dann manuell |
| `product_name` (falls nicht-lateinisch) | `nameOriginal` | oft der Originalname |
| `brands` | `brand` | Komma-separiert, ersten Wert nehmen |
| `quantity` | `contentAmount` + `contentUnit` | Freitext! `"500 g"`, `"1L"`, `"2x100g"` — parsen und bei Unsicherheit leer lassen |
| `countries_tags` | `originCountry` | Verkaufsland ≠ Herkunftsland, nur als Vorschlag |
| `ingredients_text_de` | `ingredientsDe` | häufig leer bei Importware |
| `allergens_tags` | `allergens` | Format `en:milk` — Präfix strippen, mappen |
| `nutriments` | `nutrition` | siehe unten |
| `categories_tags` | — | **nicht** automatisch übernehmen, eigener Baum |
| `image_*_url` | `ProductImage` | herunterladen, nicht hotlinken |

`quantity` ist die häufigste Fehlerquelle. Konservativ parsen: nur eindeutige
Muster wie `<Zahl><optional Space><Einheit>` übernehmen, alles andere dem Nutzer
überlassen.

## Allergene

`allergens_tags` kommt sprachpräfixiert (`en:milk`, `en:gluten`, `de:milch`).
Präfix entfernen und auf die 14 CH/EU-Hauptallergene normalisieren — Mapping-
Tabelle im Skill `swiss-food-compliance`.

Zusätzlich `traces_tags` auswerten („kann Spuren enthalten"), aber getrennt
speichern und nicht mit deklarierten Allergenen vermischen.

**Nie ungeprüft als verbindlich markieren.** OFF ist Crowdsourcing; die Angaben
sind ein Vorschlag, den der Nutzer gegen die echte Verpackung prüfen muss.

## Nährwerte

Aus `nutriments` die `_100g`-Varianten nehmen:
`energy-kcal_100g, fat_100g, saturated-fat_100g, carbohydrates_100g,
sugars_100g, fiber_100g, proteins_100g, salt_100g`

Werte können String oder Number sein → `z.coerce.number().optional()`.
Als JSON in einem eigenen Feld ablegen, nicht als 8 Spalten.

## Bilder

1. `image_front_url`, `image_ingredients_url`, `image_nutrition_url` laden
2. lokal unter `data/images/{sku}/{type}.webp` speichern
3. mit `sharp` auf max. 1200 px Kante und WebP q80 bringen, zusätzlich
   Thumbnail 300 px
4. Timeout und Fehler tolerieren — fehlendes Bild darf die Erfassung nicht stoppen

## Caching

Eigene Tabelle `OffCache`: `barcode` (PK), `rawJson`, `fetchedAt`, `found`.
TTL 30 Tage. Auch **negative** Ergebnisse cachen — sonst wird bei jedem Re-Scan
eines nicht gefundenen Artikels erneut angefragt.

## Lizenz und Fairness

- Produktdaten stehen unter **ODbL**, Bilder in der Regel unter **CC-BY-SA**.
- Für den internen Gebrauch unkritisch. Sobald OFF-Bilder oder -Texte im
  öffentlichen Webshop erscheinen, ist Namensnennung nötig — deshalb
  `sourceAttribution` bei jedem Bild und `dataSource` beim Artikel mitführen.
  Das erspart später Nacharbeit.
- Eigene Erfassungen später an OFF zurückspenden ist möglich und fair, da das
  Asia-Sortiment dort schlecht abgedeckt ist. Nicht Teil von Phase 1.

## Erwartungsmanagement

Bei asiatischen Importwaren liegt die Trefferquote deutlich unter der bei
europäischen Markenprodukten. Der manuelle Erfassungspfad ist der Normalfall
und muss ebenso schnell und angenehm sein wie der OFF-Pfad — nicht als
Notlösung behandeln. Trefferquote über `ScanLog` messen, statt zu schätzen.
