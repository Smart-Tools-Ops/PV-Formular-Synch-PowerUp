# smart nachhaltig – Projektdaten Power-Up für Trello

Ein privates, kostenloses Trello Power-Up, das auf jeder Karte ein Projektdaten-Formular
(Personalien + Planung) einblendet. Struktur, Bezeichnungen, Farben und Dropdown-Optionen
werden boardweit im Backend gepflegt; die ausgefüllten Werte werden pro Karte gespeichert.

## Die Dateien

- `index.html` – der Connector, den Trello lädt (meldet die Funktionen an)
- `form.html` – das Formular auf der Kartenrückseite
- `settings.html` – das Backend (Optionen, Farben, Bezeichnungen, Überschriften)
- `export.html` – Sammelbestellung als CSV über alle Karten des Boards
- `config.js` – gemeinsame Standardwerte und Speicher-Helfer
- `style.css` – gemeinsames Design (inkl. automatischem Dunkelmodus)
- `icon.svg` – Icon für Kartenbereich und Board-Buttons

Alle Dateien gehören zusammen in **denselben Ordner** (das Repository-Wurzelverzeichnis).

## Schritt 1 – Auf GitHub Pages hochladen (kostenlos)

1. Auf github.com kostenlos ein Konto anlegen.
2. Oben rechts „+" → „New repository". Namen vergeben (z. B. `trello-powerup`),
   Sichtbarkeit **Public** lassen, „Create repository".
3. Im Repo „Add file" → „Upload files", dann **alle** Dateien aus diesem Ordner
   hineinziehen und „Commit changes".
4. „Settings" → links „Pages" → Source „Deploy from a branch", Branch `main`,
   Ordner `/ (root)", „Save".
5. Nach ein bis zwei Minuten erscheint die Adresse:
   `https://DEINNAME.github.io/trello-powerup/`
   Diese URL ist die Basis-Adresse deines Power-Ups.

Hinweis: Öffentlich ist nur dieser Programmcode – er enthält keine Kundendaten.
Alle ausgefüllten Werte liegen in Trello, nicht im Repository.

## Schritt 2 – In Trello registrieren

1. Auf https://trello.com/power-ups/admin einloggen → „Create new Power-Up".
2. Namen vergeben, den passenden Workspace wählen (so bleibt es privat).
3. Bei „Iframe connector URL" die Adresse aus Schritt 1 eintragen, inkl. `index.html`:
   `https://DEINNAME.github.io/trello-powerup/index.html`
4. Unter „Capabilities" aktivieren:
   `card-back-section`, `card-badges`, `card-detail-badges`, `show-settings`, `board-buttons`.
5. Speichern.

## Schritt 3 – Zum Board hinzufügen und einrichten

1. Im gewünschten Board: Menü → „Power-Ups" → „Custom" → dein Power-Up „Add".
2. Über den Board-Button „Projektdaten-Optionen" das Backend öffnen und die
   Dropdown-Optionen (Modultyp, Wechselrichter, …), Farben und Bezeichnungen eintragen.
3. Eine Karte öffnen → der Bereich „Projektdaten" erscheint → ausfüllen → „Speichern".
4. Für die Sammelbestellung: Board-Button „Sammelbestellung (CSV)" → herunterladen.

## Gut zu wissen

- Die Einstellungen gelten für alle Karten des Boards.
- Speichern auf der Karte lädt den Bereich kurz neu – das ist normal.
- Power-Ups laufen nicht in den Trello-Mobile-Apps, nur im mobilen Browser.
- Trello speichert je Schlüssel begrenzt viel Text. Falls sehr viele Dropdown-Optionen
  irgendwann nicht mehr speichern, bitte Bescheid geben – dann teilen wir die Ablage auf.
- Änderungen am Design: einfach die Datei im Repo ersetzen; GitHub veröffentlicht die
  neue Version automatisch in ca. einer Minute.

---

## Kartensynchronisation (Sync-Erweiterung)

Auf jeder Karte gibt es einen Button "Synchronisation starten". Er spiegelt die
Karte in ein wählbares Board + Spalte. Danach zeigt die Karte "Synchronisieren"
(gleicht Kernfelder + Formulardaten mit dem Pendant ab) und "Synchronisation
stoppen" (löst die Verbindung). Der Abgleich ist manuell per Knopfdruck.

### Einmalige Einrichtung fürs Sync
1. In `config.js` oben bei `APP_KEY` deinen Trello-API-Key eintragen
   (Power-Up-Admin -> "API-Schlüssel"). Dort auch deine Pages-Domain als
   "Allowed Origin" hinzufügen (z. B. `https://smart-tools-ops.github.io`).
2. Im Admin-Portal unter "Funktionen" zusätzlich `card-buttons` aktivieren.
3. Beim ersten Klick auf einen Sync-Button erscheint ein Trello-Fenster
   "Zugriff erlauben" - einmal bestätigen. Das macht jede Person, die
   synchronisiert (du und der Mitarbeiter).

### Wichtige Voraussetzungen und Grenzen
- Beide Boards müssen im selben Workspace (Arbeitsbereich) liegen - die
  Verknüpfung wird auf Workspace-Ebene gespeichert.
- Wer synchronisiert, muss Mitglied beider Boards sein.
- Abgeglichen werden: Titel, Beschreibung, Fälligkeit, Labels und die
  Formulardaten. Checklisten, Kommentare und Anhänge noch nicht.
- Kernfelder: die zuletzt geänderte Karte gewinnt; wurde die andere Seite seit
  dem letzten Abgleich geändert, kommt vorher eine Rückfrage.
- Formulardaten lassen sich technisch nur in die gerade offene Karte holen:
  Sie wandern beim Abgleich der jeweiligen Karte, nicht per Fernschreibzugriff.

### Geänderte/neue Dateien fürs Sync
Neu: `sync.js`, `sync-start.html`, `sync-run.html`.
Geändert: `index.html`, `config.js`, `form.html`.

---

## v2 – Karten-basierte Verknüpfung (dieses Power-Up)

Unterschied zur ersten Version: Die Verknüpfung zweier Karten liegt jetzt auf
der Karte selbst (nicht mehr auf Workspace-Ebene). Dadurch funktioniert die
Synchronisation nutzer- und workspace-übergreifend, und normale Mitglieder /
Board-Admins können sie auslösen (kein Workspace-Admin nötig).

### Einrichtung (einmalig)
1. In `config.js` oben den `APP_KEY` eintragen (eigener API-Key dieses zweiten
   Power-Ups) und die Pages-Domain als "Allowed Origin" hinterlegen.
2. Im Admin-Portal genügt die Funktion `card-back-section` (card-buttons wird
   NICHT mehr benötigt).
3. Jede Person erteilt einmalig die Trello-Freigabe: unten im Projektdaten-Kasten
   auf "Synchronisation starten" bzw. "Trello-Freigabe erteilen", Code aus dem
   Trello-Tab einfügen, speichern.

### So läuft es
- "Synchronisation starten" legt die Kopie auf dem gewählten Board/Spalte an und
  hinterlegt auf der Kopie einen kleinen Marker-Anhang.
- Beim ersten Öffnen der Kopie (mit erteilter Freigabe) erkennt sie sich über den
  Marker selbst als verknüpft; der Marker wird danach automatisch entfernt.
- "Synchronisieren" gleicht Kernfelder, Kommentare, Anhänge (Best-Effort) und die
  Projektdaten ab. Projektdaten wandern per "Abholen beim Öffnen/Abgleichen".
- "Synchronisation stoppen" trennt die eigene Karte; die Partnerkarte merkt beim
  nächsten Öffnen, dass die Rückverknüpfung fehlt, und trennt sich selbst.

### Wichtig
- Nicht gleichzeitig mit dem alten Power-Up auf demselben Board scharf schalten –
  sonst erscheinen zwei "Projektdaten"-Kästen. Erst testen, dann altes entfernen.
- Backend-Einstellungen (Dropdown-Optionen) werden pro Power-Up gespeichert und
  müssen hier einmal neu gesetzt werden.
