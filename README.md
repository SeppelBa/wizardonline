# Wizard Online – kostenlos mit Freunden am Handy spielen

Dieses Projekt ist für GitHub Pages + Firebase Realtime Database gedacht.

## Enthalten
- Raumcode-System
- echte Wizard-Rundenlogik
- automatische Punkte
- Trumpfwahl
- Bots
- mobile Oberfläche
- PWA / Homescreen-Installierbar
- Jubiläums-Sonderkarten inkl. Jongleur (Wert 7½, Kartenweitergabe an den linken Nachbarn)

## So richtest du es ein

1. Erstelle in Firebase ein Projekt.
2. Aktiviere Realtime Database.
3. Lege eine Web-App an und kopiere die Config in `config.js`.
4. Übertrage die RTDB-Regeln aus `database.rules.json` in dein Firebase-Projekt (Realtime Database → Rules).
5. Lade alle Dateien in ein GitHub-Repository hoch.
6. Aktiviere GitHub Pages in den Repository-Einstellungen.

## Spielen
- Einer erstellt den Raum.
- Die anderen treten mit demselben Raumcode bei.
- Wenn mindestens 2 Spieler drin sind, startet der Host das Spiel.
- Bots kannst du in der Lobby hinzufügen.
- Im Einstellungen-Dialog lassen sich Jubiläums-Sonderkarten aktivieren.

## Jongleur (Sonderkarte)
- Wert 7½, kann immer gespielt werden (auch wenn Bedienen möglich wäre).
- Beim Ausspielen wählt der Spieler eine Farbe; auch Trumpf möglich.
- Wird der Jongleur als Trumpfkarte aufgedeckt, wählt der Geber den Trumpf.
- Wenn der Jongleur den Stich eröffnet, ist die angesagte Farbe die Bedienfarbe.
- Nach einem Stich mit Jongleur gibt jeder gleichzeitig eine Handkarte verdeckt an den linken Nachbarn weiter. Bei einer Bombe entfällt das nur, wenn es der letzte Stich der Runde war.

## Dateien
- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `manifest.json`
- `sw.js`
- `icon.png`
- `database.rules.json`
- `.gitignore`
