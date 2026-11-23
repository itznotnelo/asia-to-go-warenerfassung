# Asia To Go App: was ist neu

## Version 0.3: das Lager

Oben gibt es jetzt den Menüpunkt **«Lager»**. Die App weiss damit, wie viel von einem Artikel im Laden ist. Jede Änderung am Bestand ist eine Buchung, die man später nachlesen kann.

### So fängst du an

1. **Lieferanten eintragen:** Lager, Lieferanten, «Neuer Lieferant». Name reicht, Telefon und eure Kundennummer helfen beim Bestellen.
2. **Einmal zählen:** Lager, Inventur, «Zählung starten» (zum Beispiel «Regal 1»). Jeden Artikel scannen. Jeder Scan zählt 1 Stück. Bei einem ganzen Karton die Zahl eintippen und Enter. Am Schluss «Inventur buchen». Erst ab dann führt die App für diese Artikel einen Bestand.
3. Artikel, die du nie zählst, laufen weiter wie bisher mit dem Häkchen «Verfügbar».

### Jeden Tag

- **Lieferung kommt (Wareneingang):** Lieferant wählen, «Lieferung starten», dann jeden Artikel scannen. Anzahl Karton eintippen, Enter. Stück pro Karton, Einkaufspreis (ohne MwSt) und MHD sind schon ausgefüllt oder freiwillig. Am Schluss «Lieferung einbuchen». Kennt die App einen Barcode nicht, kannst du den Artikel gleich erfassen und kommst danach zurück zur Lieferung.
- **Verkauf im Laden (Verkauf erfassen):** Solange keine Kasse angeschlossen ist: Artikel scannen, Menge 1 steht schon da, Enter. Mehrere Artikel: einfach weiterscannen, der vorherige wird dabei gebucht. Falsch gescannt? «Rückgängig».
- **Online-Bestellungen** ziehen den Bestand selbst ab. «Stornieren» bei einer Bestellung bucht die Ware zurück (das Geld zurückzahlen geht nicht über die App).

### Was die App dir zeigt

- **Übersicht:** Wert des Lagers zum Einkaufspreis, was bald leer ist, was bald abläuft, Ladenhüter (60 Tage nichts passiert) und die letzten Buchungen.
- **Haltbarkeit:** was abgelaufen ist oder in 7 oder 30 Tagen abläuft. «Zuerst verkaufen» zeigt, welche Lieferung nach vorne ins Regal gehört. «Abschreiben» bucht den Rest weg, mit Grund.
- **Nachbestellen:** alles am oder unter dem Meldebestand, pro Lieferant, mit Bestellmenge in Karton. «Bestelltext kopieren» und selbst per WhatsApp oder Mail schicken. Die App schickt nie etwas. Drucken geht auch.
- **Inventarliste:** für den Jahresabschluss. Stichtag wählen (zum Beispiel 31.12.), dann drucken oder «Excel (CSV)».
- **Im Artikel** gibt es den Block «Lager»: Bestand, Marge, Lieferungen mit MHD, die letzten Buchungen und die Knöpfe Bestand korrigieren, Abschreiben, Retour an Lieferant. Unter «Einstellungen» im Block stellst du Meldebestand, Bestellmenge, Stück pro Karton, Einkaufspreis und Lieferant ein.

### Webshop

Hat ein Artikel einen Bestand, entscheidet der Bestand, ob er online sichtbar ist: nur solange mehr als 1 Stück da ist. So wird das letzte Stück nicht online verkauft, wenn es vielleicht schon jemand im Laden in der Hand hat. Die Zahl änderst du unter Einstellungen, «Lager und Webshop». Das Häkchen «Verfügbar» gibt es bei solchen Artikeln nicht mehr.

### Gut zu wissen

- Bestand unter null ist erlaubt (die Ware war ja da), die App zeigt ihn rot. Dann nachzählen und «Bestand korrigieren».
- Jede Buchung bleibt gespeichert. «Rückgängig» macht eine Gegenbuchung, es wird nichts gelöscht. Rückgängig geht nur bei der letzten Buchung eines Artikels.
- Die tägliche Datensicherung enthält alles, auch Lager, Lieferanten und Buchungen.

## Das musst du einmal tun

**Allergene bei jedem Artikel bestätigen.** Im Artikel gibt es jetzt das Häkchen «Allergene geprüft». Artikel ohne Häkchen erscheinen nicht mehr im Shop. Das gilt auch für Artikel, die schon online sind: Sie verschwinden aus dem Shop, bis du die Allergene angeschaut und das Häkchen gesetzt hast.

So geht es: Artikel öffnen, Allergene prüfen, «Allergene geprüft» ankreuzen, speichern. Allergene aus der Online-Suche sind nur ein Vorschlag, das Häkchen setzt immer ein Mensch. Wenn du ein Allergen änderst, geht das Häkchen wieder weg.

Neu ist auch die Zeile «Kann Spuren enthalten von». Dort trägst du Spuren ein, getrennt von den Allergenen.

## Beim ersten Start

Die App stellt beim ersten Start ihre Datenbank um, damit thailändische und chinesische Namen richtig gespeichert werden. Vorher macht sie eine Sicherung. Das kann etwas dauern, bitte die App nicht schliessen. Falls etwas schiefgeht, gehen keine Daten verloren. Dann einfach HQ melden.

## Neu unter Einstellungen

Der Menüpunkt «Website-Sync» heisst jetzt «Einstellungen».

**Datensicherung.** Die App sichert deine Daten jeden Tag und vor jedem Update von selbst. Mit «Datensicherung erstellen» sicherst du sofort. Unter «Zweite Kopie: Ordner wählen …» kannst du einen USB-Stick oder den Nextcloud-Ordner wählen, dann landet jede Sicherung auch dort. Ist die letzte Sicherung zu alt oder hat sie zweimal nicht geklappt, zeigt die App oben einen roten Balken mit «Jetzt sichern». Beim Scannen bleibt der Balken weg.

**Daten zurückholen.** Mit «Daten zurückholen …» holst du einen früheren Stand zurück. Die App fragt vorher nach und sichert den heutigen Stand zuerst. Danach fragt sie, ob die Artikel neu an die Website sollen. Wenn du «Später» wählst, bleibt der Website-Abgleich angehalten, bis du «Jetzt neu senden» drückst. Die Anleitung «Daten zurückholen» liegt als Blatt bei.

**Exporte.** Die Knöpfe für Export JSON und CSV sind von der Übersicht nach Einstellungen unter «Weitere Exporte» umgezogen.

**Bestellungen.** Eine fehlerhafte Bestellung hält die anderen nicht mehr auf. Die übrigen kommen an, die fehlerhafte versucht die App später nochmals. Wenn du unter Einstellungen von Hand abgleichst, siehst du, welche Bestellungen noch fehlen. Die Bestellliste zeigt die älteste Bestellung zuoberst.

## Was sonst besser läuft

- **Scanner im Preisfeld:** Scannst du aus Versehen, während ein Preisfeld aktiv ist, bleibt der Preis stehen. Die App behandelt den Barcode als Scan.
- **Preise:** «1'250.00» geht jetzt. Unklare Eingaben wie «3 50» markiert die App rot, statt einen falschen Preis zu speichern. Höchstpreis ist CHF 10'000.
- **Speichern:** Klappt das Speichern nicht, steht eine Meldung über den Knöpfen. Der Knopf bleibt nicht mehr auf «Speichert …» hängen.
- **Ohne Internet:** Änderungen bleiben gespeichert, bis die Website sie bekommen hat, auch wenn das Internet lange weg ist.
- **Mehrere Artikel ändern:** Neue MwSt oder Kategorie für viele Artikel aufs Mal kommt jetzt auch im Shop an. Als MwSt gehen nur 2.6 % und 8.1 %.

## Neu: sehen, was noch fehlt

- **Im Artikel** steht jetzt oben, ob er im Webshop sichtbar ist. Wenn nicht, steht dort, was noch fehlt, zum Beispiel «Foto» oder «Allergene prüfen».
- **Unter «Fortschritt»** (hiess vorher «Dashboard») siehst du bei jedem Artikel, was fehlt. Mit «Ersten Artikel ergänzen» fängst du an, danach führt dich «Weiter mit: …» zum nächsten.
- **Nach dem Scannen** bleibt der zuletzt gespeicherte Artikel stehen, mit dem Link «Foto und Details ergänzen».
- **Foto neu machen:** Ein neues Foto der Vorderseite, der Zutaten oder der Nährwerte ersetzt das alte. Im Webshop erscheint nur noch das neue.
- **Preis geändert und weitergescannt?** Die App fragt jetzt auch bei einem schon erfassten Artikel nach, bevor die Änderung verloren geht.
