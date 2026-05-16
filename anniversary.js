// anniversary.js - Vollständige Auslagerung für die Jubiläums-Edition

const ANNIVERSARY_KINDS = {
  DRAGON: "dragon",
  PIXIE: "pixie",
  BOMB: "bomb",
  WEREWOLF: "werewolf",
  JUGGLER: "juggler",
  CLOUD: "cloud",
  SHAPESHIFTER: "shapeshifter"
};

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

export function injectAnniversaryCards(deck, uidCounter) {
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.DRAGON, label: "Drache" });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.PIXIE, label: "Fee" });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.BOMB, label: "Bombe" });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.WEREWOLF, label: "Werwolf" });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.JUGGLER, label: "Jongleur", rank: 7.5 });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.CLOUD, label: "Wolke", rank: 9.75 });
  deck.push({ id: uidCounter(), kind: ANNIVERSARY_KINDS.SHAPESHIFTER, label: "Gestaltenwandler" });
  return deck;
}

export function evaluateAnniversaryTrick(trick, trumpSuit, ledSuit) {
  const hasBomb = trick.some(p => p.card.kind === ANNIVERSARY_KINDS.BOMB);
  if (hasBomb) return { winnerId: "bomb_exploded", exploded: true };
  
  const dragonPlay = trick.find(p => p.card.kind === ANNIVERSARY_KINDS.DRAGON);
  const pixiePlay = trick.find(p => p.card.kind === ANNIVERSARY_KINDS.PIXIE);
  
  if (dragonPlay && pixiePlay) return { winnerId: pixiePlay.playerId, exploded: false };
  if (dragonPlay) return { winnerId: dragonPlay.playerId, exploded: false };
  
  const firstWizard = trick.find(p => p.card.kind === "wizard" || (p.card.kind === ANNIVERSARY_KINDS.SHAPESHIFTER && p.card.currentRole === "wizard"));
  if (firstWizard) return { winnerId: firstWizard.playerId, exploded: false };
  
  const allLow = trick.every(p => getAnniversaryStrength(p.card, trumpSuit, ledSuit) < 0);
  if (allLow) return { winnerId: trick[0].playerId, exploded: false };
  
  let bestPlay = trick[0];
  for (const play of trick) {
    if (getAnniversaryStrength(play.card, trumpSuit, ledSuit) > getAnniversaryStrength(bestPlay.card, trumpSuit, ledSuit)) {
      bestPlay = play;
    }
  }
  return { winnerId: bestPlay.playerId, exploded: false };
}
