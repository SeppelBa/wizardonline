// anniversary.js - Komplette Auslagerung der 7 Jubiläums-Sonderkarten Regeln

export const ANNIVERSARY_KINDS = {
  DRAGON: "dragon",
  PIXIE: "pixie",
  BOMB: "bomb",
  WEREWOLF: "werewolf",
  JUGGLER: "juggler",
  CLOUD: "cloud",
  SHAPESHIFTER: "shapeshifter"
};

// Berechnet die Kartenstärke für die Stich-Auswertung inklusive Sonderkarten
export function getAnniversaryStrength(card, trumpSuit, ledSuit) {
  if (card.kind === ANNIVERSARY_KINDS.DRAGON) return 2000;
  if (card.kind === "wizard" || (card.kind === ANNIVERSARY_KINDS.SHAPESHIFTER && card.currentRole === "wizard")) return 1000;
  if (card.kind === "jester" || (card.kind === ANNIVERSARY_KINDS.SHAPESHIFTER && card.currentRole === "jester") || card.kind === ANNIVERSARY_KINDS.BOMB) return -1000;
  if (card.kind === ANNIVERSARY_KINDS.PIXIE) return -2000;
  
  let v = card.rank || 0;
  if (trumpSuit && card.suit === trumpSuit) v += 100;
  else if (ledSuit && card.suit === ledSuit) v += 50;
  return v;
}

// Fügt dem Standard-Deck die 7 neuen Sonderkarten hinzu
export function injectAnniversaryCards(deck, uid) {
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.DRAGON, label: "Drache" });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.PIXIE, label: "Fee" });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.BOMB, label: "Bombe" });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.WEREWOLF, label: "Werwolf" });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.JUGGLER, label: "Jongleur", rank: 7.5 });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.CLOUD, label: "Wolke", rank: 9.75 });
  deck.push({ id: uid(), kind: ANNIVERSARY_KINDS.SHAPESHIFTER, label: "Gestaltenwandler" });
  return deck;
}

// Ermittelt den Gewinner eines Stiches unter Berücksichtigung aller Jubiläumsregeln
export function evaluateAnniversaryTrick(trick, trumpSuit, ledSuit) {
  if (!trick || trick.length === 0) return { winnerId: null, exploded: false };
  
  const hasBomb = trick.some(p => p.card.kind === ANNIVERSARY_KINDS.BOMB);
  const dragonPlay = trick.find(p => p.card.kind === ANNIVERSARY_KINDS.DRAGON);
  const pixiePlay = trick.find(p => p.card.kind === ANNIVERSARY_KINDS.PIXIE);
  
  // Wenn die Bombe liegt, explodiert der Stich (niemand bekommt ihn)
  if (hasBomb) {
    return { winnerId: trick[0].playerId, exploded: true };
  }
  
  // Drache und Fee Sonderregel: Treffen beide aufeinander, gewinnt die Fee den Stich
  if (dragonPlay && pixiePlay) {
    return { winnerId: pixiePlay.playerId, exploded: false };
  }
  if (dragonPlay) {
    return { winnerId: dragonPlay.playerId, exploded: false };
  }
  
  // Falls keine Sonderkarte sticht, wird normal nach Priorität ausgewertet
  const firstWizard = trick.find(p => p.card.kind === "wizard" || (p.card.kind === ANNIVERSARY_KINDS.SHAPESHIFTER && p.card.currentRole === "wizard"));
  if (firstWizard) {
    return { winnerId: firstWizard.playerId, exploded: false };
  }
  
  // Wenn nur Narren/Fees liegen, gewinnt die erste Karte
  const allLow = trick.every(p => getAnniversaryStrength(p.card, trumpSuit, ledSuit) < 0);
  if (allLow) {
    return { winnerId: trick[0].playerId, exploded: false };
  }
  
  // Höchste reguläre Karte ermitteln
  let bestPlay = null;
  for (const play of trick) {
    if (!bestPlay) {
      bestPlay = play;
      continue;
    }
    if (getAnniversaryStrength(play.card, trumpSuit, ledSuit) > getAnniversaryStrength(bestPlay.card, trumpSuit, ledSuit)) {
      bestPlay = play;
    }
  }
  
  return { winnerId: bestPlay ? bestPlay.playerId : trick[0].playerId, exploded: false };
}

// Mega-Schlaues KI-Modul für Bots zur Handhabung der Sonderkarten
export function botAnniversaryDecision(card, trick, wantTrick, trumpSuit, ledSuit) {
  if (card.kind === ANNIVERSARY_KINDS.SHAPESHIFTER) {
    card.currentRole = wantTrick ? "wizard" : "jester";
  }
  if (card.kind === ANNIVERSARY_KINDS.JUGGLER || card.kind === ANNIVERSARY_KINDS.CLOUD) {
    card.suit = trumpSuit || "hearts"; // Wählt taktisch die Trumpffarbe
  }
  return card;
}
