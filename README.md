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
- Jubiläums-Sonderkarten inkl. Jongleur (Wert 7½, Kartenweitergabe an den linken Nachbarn) und Wolke (Wert 9¾, ±1-Anpassung der Ansage am Rundenende)

## So richtest du es ein

1. Erstelle in Firebase ein Projekt.
2. Aktiviere Realtime Database.
3. Lege eine Web-App an und kopiere die Config in `config.js`.
4. Übertrage die RTDB-Regeln aus `database.rules.json` in dein Firebase-Projekt (Realtime Database → Rules).
5. Lade alle Dateien in ein GitHub-Repository hoch.
6. Aktiviere GitHub Pages in den Repository-Einstellungen.

## Spielen
- Einer erstellt den Raum.
- Die anderen treten mit demselben Raumcode bei (oder über den Teilen-Button: WhatsApp, Web Share, QR-Code).
- Wenn mindestens 2 Spieler drin sind, startet der Host das Spiel.
- Bots kannst du in der Lobby hinzufügen.
- Im Einstellungen-Dialog lassen sich einzelne Sonderkarten an-/ausschalten und die „Schnelle Runde" (Auto-Weiter) aktivieren.
- Spieler, die kurz die Verbindung verlieren, werden als „offline" markiert und können einfach wieder reinkommen – ihre Punkte und ihr Platz bleiben erhalten.
- Nach allen Runden zeigt ein eigener Gewinner-Screen das Podium an. Das Ergebnis lässt sich kopieren.

## Neu in dieser Runde (Pause & Raumliste)
- **Pausenmodus für lange Unterbrechungen:** Der Host hat im laufenden Spiel den Button `⏸ Spiel pausieren`. Solange der Raum pausiert ist (`paused: true`), passiert nichts mehr automatisch: Bots ziehen nicht, der Fast-Mode überspringt nichts, Stiche werden nicht abgeräumt, und kein Spieler wird nach Ablauf der 2-Minuten-Frist entfernt. Plätze bleiben dauerhaft reserviert. Spieler kommen später über denselben Raumcode/Link mit ihrer persistenten `playerId` an ihren Platz zurück. Beim Fortsetzen werden ggf. abgelaufene Rejoin-Fristen freundlich erneuert. Die `phase` wird während Pause **nicht** überschrieben – das Spiel macht nach `▶️ Spiel fortsetzen` an genau derselben Stelle weiter.
- **Aktive Raumliste robuster:** Die Liste auf der Startseite wird jetzt zuverlässig angezeigt, auch wenn ein Raum kein `createdAt` hat (Fallback auf `updatedAt`/`listedAt`). Bei jedem Beitritt wird `updatedAt` aktualisiert. Statt einer komplett unsichtbaren Box gibt es jetzt einen freundlichen Leerzustand `Noch keine aktiven Räume. Erstelle den ersten!`. Wenn die RTDB-Regeln das globale Lesen unter `/rooms` verbieten, erscheint stattdessen ein klarer Hinweis statt einer leeren Box.
- **Sicherheitshinweis zu den RTDB-Regeln:** Für die aktive Raumliste muss `/rooms` global lesbar sein (`.read: true` auf `rooms`), weil Firebase Realtime Database keine Field-Level-Reads kennt. Das heißt: jeder, der den Datenbank-Endpunkt kennt, kann grundsätzlich alle Raum-Metadaten und Spielstände lesen. Für ein freundliches Couch-Spiel mit kurzlebigen Raumcodes ist das ein akzeptabler Tradeoff. Schreibzugriff bleibt weiterhin auf gültige 4–8-stellige Raumcodes beschränkt. Wenn du strengere Vertraulichkeit willst, müsstest du eine Auth-Lösung (anonyme Auth + UID-basierte Regeln) ergänzen.

## Neu seit Mai 2026
- **Rejoin-Frist (2 Minuten):** Wer das Spiel mitten in einer Runde verlässt oder kurz offline geht, behält den Sitzplatz für zwei Minuten. In der Spielerliste läuft ein Countdown-Badge `⏳ MM:SS`. Nach Ablauf wird der Platz automatisch freigegeben und ggf. der Host weitergereicht.
- **Aktive Räume direkt auf der Startseite:** Eine Live-Liste zeigt offene Räume mit Raumcode, Spielerzahl und Phase. Ein Tipp füllt den Code aus oder tritt direkt bei, sofern der Name schon gesetzt ist.
- **Einladungslinks mit Namensabfrage:** Beim Aufruf von `?room=CODE` oder QR-Scan landet man nicht länger stillschweigend als Zuschauer im Raum. Stattdessen erscheint ein Einladungs-Banner mit vorausgefülltem Code, und das Namensfeld bleibt im Fokus. Läuft im Zielraum bereits eine Partie, weist der Banner klar auf den Zuschauer-Modus hin. Reconnect mit derselben Browser-Session funktioniert weiterhin automatisch.
- **Sicherheitsabfrage für Reset:** Setzt der Host die Runde mitten im Spiel zurück, erscheint zuerst eine mobiltaugliche Bestätigungsabfrage `Möchtest du wirklich die laufende Runde zurücksetzen?`. In der Lobby gibt es weiterhin keinen unnötigen Klick.

## Wolke (Sonderkarte)
- Wert 9¾, kann immer gespielt werden (auch wenn Bedienen möglich wäre).
- Beim Ausspielen wählt der Spieler eine Farbe; auch Trumpf möglich.
- Wird die Wolke als Trumpfkarte aufgedeckt, wählt der Geber den Trumpf.
- Wenn die Wolke den Stich eröffnet, ist die angesagte Farbe die Bedienfarbe.
- Liegt die Wolke am Ende einer Stichrunde in den gewonnenen Stichen eines Spielers, muss dieser seine Stichansage um +1 oder -1 anpassen.
- Wolke + Bombe im gleichen Stich: keine Anpassung (Stich verfällt, kein Gewinner).

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
