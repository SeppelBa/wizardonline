import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const MAX_PLAYERS = 6;
const SUITS = [
  { key: "hearts", label: "Herz", short: "♥", css: "red" },
  { key: "spades", label: "Pik", short: "♠", css: "black" },
  { key: "clubs", label: "Kreuz", short: "♣", css: "green" },
  { key: "diamonds", label: "Karo", short: "♦", css: "yellow" },
];
const SUIT_BY_KEY = Object.fromEntries(SUITS.map(s => [s.key, s]));
const BOT_NAMES = ["Merlin", "Gandalf", "Morgana", "HexerBot", "Rumpel", "Zaubix", "Arcana", "Fawkes", "Nexus", "Eldrin"];

const els = {
  joinView: document.getElementById("joinView"),
  gameView: document.getElementById("gameView"),
  nameInput: document.getElementById("nameInput"),
  roomInput: document.getElementById("roomInput"),
  joinBtn: document.getElementById("joinBtn"),
  createBtn: document.getElementById("createBtn"),
  shareBtn: document.getElementById("shareBtn"),
  copyRoomBtn: document.getElementById("copyRoomBtn"),
  leaveBtn: document.getElementById("leaveBtn"),
  roomLabel: document.getElementById("roomLabel"),
  phaseLabel: document.getElementById("phaseLabel"),
  roundLabel: document.getElementById("roundLabel"),
  trumpLabel: document.getElementById("trumpLabel"),
  turnLabel: document.getElementById("turnLabel"),
  dealerLabel: document.getElementById("dealerLabel"),
  playersList: document.getElementById("playersList"),
  bidsList: document.getElementById("bidsList"),
  trickTable: document.getElementById("trickTable"),
  trickInfo: document.getElementById("trickInfo"),
  hand: document.getElementById("hand"),
  handHint: document.getElementById("handHint"),
  scores: document.getElementById("scores"),
  finishInfo: document.getElementById("finishInfo"),
  startBtn: document.getElementById("startBtn"),
  resetBtn: document.getElementById("resetBtn"),
  addBotBtn: document.getElementById("addBotBtn"),
  fillBotsBtn: document.getElementById("fillBotsBtn"),
  bidControls: document.getElementById("bidControls"),
  trumpChoiceControls: document.getElementById("trumpChoiceControls"),
  bidInput: document.getElementById("bidInput"),
  bidBtn: document.getElementById("bidBtn"),
  bidHint: document.getElementById("bidHint"),
  biddingInfo: document.getElementById("biddingInfo"),
  nextRoundBtn: document.getElementById("nextRoundBtn"),
  roundOverlay: document.getElementById("roundOverlay"),
  roundResults: document.getElementById("roundResults"),
  closeOverlayBtn: document.getElementById("closeOverlayBtn"),
  leaderboardList: document.getElementById("leaderboardList"),
  toastContainer: document.getElementById("toastContainer"),
};

const LOCAL = {
  playerId: "wizard.playerId",
  playerName: "wizard.playerName",
  roomCode: "wizard.roomCode"
};

let currentRoomCode = "";
let currentPlayerId = getOrCreateId();
let currentName = localStorage.getItem(LOCAL.playerName) || "";
let roomUnsub = null;
let roomCache = null;
let botTimerKey = "";
let overlayAlreadyShown = false;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function getOrCreateId() {
  let id = localStorage.getItem(LOCAL.playerId);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL.playerId, id);
  }
  return id;
}

function getOrCreateName() {
  const value = els.nameInput.value.trim() || localStorage.getItem(LOCAL.playerName) || "";
  return value.slice(0, 20);
}

function normalizeRoomCode(v) {
  return (v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function randomRoomCode() {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid() {
  return crypto.randomUUID();
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: uid(),
        kind: "card",
        suit: suit.key,
        rank,
        label: String(rank)
      });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: uid(), kind: "wizard", label: "Zauberer" });
    deck.push({ id: uid(), kind: "jester", label: "Narr" });
  }
  return shuffle(deck);
}

function scoreRound(bid, taken) {
  return bid === taken ? 20 + (10 * taken) : -10 * Math.abs(bid - taken);
}

function highestScoreWinner(room) {
  const players = Object.values(room.players || {});
  if (!players.length) return null;
  return players.reduce((best, p) => (!best || (p.score || 0) > (best.score || 0) ? p : best), null);
}

function playerIds(room) {
  return Array.isArray(room.order) ? room.order.slice() : Object.keys(room.players || {});
}

function getPlayer(room, playerId) {
  return room.players?.[playerId] || null;
}

function playerName(room, playerId) {
  const p = getPlayer(room, playerId);
  return p ? p.name : "—";
}

function seatOf(room, playerId) {
  return playerIds(room).indexOf(playerId);
}

function currentTurnPlayerId(room) {
  const order = playerIds(room);
  return order[room.turnIndex] || null;
}

function dealerPlayerId(room) {
  const order = playerIds(room);
  return order[room.dealerIndex] || null;
}

function roundSize(room) {
  return room.roundNo || 1;
}

function maxRound(room) {
  return room.maxRound || 0;
}

function trickCount(room) {
  return room.trickCount || 0;
}

function handOf(room, playerId) {
  return room.hands?.[playerId] || [];
}

function currentTrick(room) {
  return room.currentTrick || [];
}

function isBot(room, playerId) {
  return !!room.players?.[playerId]?.isBot;
}

function cardLabel(card) {
  if (!card) return "—";
  if (card.kind === "wizard") return "Zauberer";
  if (card.kind === "jester") return "Narr";
  const suit = SUIT_BY_KEY[card.suit];
  return `${suit ? suit.short : "?"} ${card.rank}`;
}

function cardStrength(card, trumpSuit, ledSuit) {
  if (card.kind === "wizard") return 1000;
  if (card.kind === "jester") return -1000;
  let v = card.rank;
  if (trumpSuit && card.suit === trumpSuit) v += 100;
  else if (ledSuit && card.suit === ledSuit) v += 50;
  return v;
}

function getLedSuit(trick) {
  for (const play of trick || []) {
    if (play.card?.kind === "wizard") return { wizardLed: true, ledSuit: null };
    if (play.card?.kind === "card") return { wizardLed: false, ledSuit: play.card.suit };
  }
  return { wizardLed: false, ledSuit: null };
}

function legalCards(hand, trick, trumpSuit) {
  if (!hand?.length) return [];
  const info = getLedSuit(trick);
  if (info.wizardLed || !info.ledSuit) return hand.slice();
  const hasSuit = hand.some(c => c.kind === "card" && c.suit === info.ledSuit);
  if (!hasSuit) return hand.slice();
  return hand.filter(c => c.kind !== "card" || c.suit === info.ledSuit);
}

function isLegalPlay(card, hand, trick, trumpSuit) {
  return legalCards(hand, trick, trumpSuit).some(c => c.id === card.id);
}

function determineTrickWinner(trick, trumpSuit) {
  if (!trick?.length) return null;
  const firstWizard = trick.find(play => play.card.kind === "wizard");
  if (firstWizard) return firstWizard.playerId;

  const allJesters = trick.every(play => play.card.kind === "jester");
  if (allJesters) return trick[0].playerId;

  const led = trick.find(play => play.card.kind === "card");
  const ledSuit = led?.card?.suit || null;

  const trumpPlays = trumpSuit
    ? trick.filter(play => play.card.kind === "card" && play.card.suit === trumpSuit)
    : [];

  const candidates = trumpPlays.length
    ? trumpPlays
    : trick.filter(play => play.card.kind === "card" && play.card.suit === ledSuit);

  if (!candidates.length) {
    return trick.find(play => play.card.kind === "jester")?.playerId || trick[0].playerId;
  }

  return candidates.reduce((best, play) => {
    if (!best) return play;
    return (play.card.rank > best.card.rank) ? play : best;
  }, null).playerId;
}

function botStrengthForHand(hand, trumpSuit) {
  let score = 0;
  for (const card of hand) {
    if (card.kind === "wizard") score += 40;
    else if (card.kind === "jester") score -= 6;
    else {
      score += card.rank;
      if (trumpSuit && card.suit === trumpSuit) score += 10;
      if (card.rank >= 11) score += 4;
      if (card.rank >= 8) score += 2;
    }
  }
  return score;
}

function botBid(room, playerId) {
  const hand = handOf(room, playerId);
  const trumpSuit = room.trumpSuit;
  const round = roundSize(room);
  let estimate = Math.round(botStrengthForHand(hand, trumpSuit) / 35);
  estimate = Math.max(0, Math.min(round, estimate));
  if (Math.random() < 0.15) estimate = Math.max(0, Math.min(round, estimate + (Math.random() < 0.5 ? -1 : 1)));
  return estimate;
}

function botTrumpChoice(room, playerId) {
  const hand = handOf(room, playerId).filter(c => c.kind === "card");
  if (!hand.length) return "hearts";
  const tally = Object.fromEntries(SUITS.map(s => [s.key, 0]));
  for (const card of hand) {
    tally[card.suit] += card.rank + (card.rank >= 11 ? 2 : 0);
  }
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
}

function botChoosePlay(room, playerId) {
  const hand = handOf(room, playerId);
  const trick = currentTrick(room);
  const legal = legalCards(hand, trick, room.trumpSuit);
  const sorted = legal.slice().sort((a, b) => {
    const info = getLedSuit(trick);
    const sa = cardStrength(a, room.trumpSuit, info.ledSuit);
    const sb = cardStrength(b, room.trumpSuit, info.ledSuit);
    return sa - sb;
  });
  const bid = room.bids?.[playerId] ?? 0;
  const taken = room.tricksTaken?.[playerId] ?? 0;
  if (taken < bid) return sorted[sorted.length - 1];
  return sorted[0];
}

function roundDealerIndex(room, roundNo) {
  const order = playerIds(room);
  return (roundNo - 1) % Math.max(order.length, 1);
}

function buildRoundState(room, roundNo) {
  const order = playerIds(room);
  const deck = createDeck();
  const hands = {};
  const size = roundNo;
  for (let i = 0; i < order.length; i++) {
    hands[order[i]] = deck.slice(i * size, (i + 1) * size);
  }
  const trumpCard = deck[order.length * size] || null;
  const dealerIndex = roundDealerIndex(room, roundNo);
  const leaderIndex = (dealerIndex + 1) % order.length;
  const phase = trumpCard?.kind === "wizard" ? "choose_trump" : "bidding";
  const trumpSuit = trumpCard?.kind === "card" ? trumpCard.suit : null;

  const tricksTaken = {};
  const bids = {};
  for (const id of order) {
    tricksTaken[id] = 0;
    bids[id] = null;
  }

  return {
    phase,
    roundNo,
    maxRound: room.maxRound,
    dealerIndex,
    leaderIndex,
    turnIndex: phase === "choose_trump" ? dealerIndex : leaderIndex,
    bidStartIndex: (dealerIndex + 1) % order.length,
    currentBidOrderIndex: 0,
    currentTrick: [],
    trickCount: 0,
    bids,
    tricksTaken,
    hands,
    trumpCard,
    trumpSuit,
    pendingTrumpChoiceSeat: phase === "choose_trump" ? dealerIndex : null,
    message: phase === "choose_trump"
      ? `${playerName(room, order[dealerIndex])} darf die Trumpffarbe wählen.`
      : `Ansage beginnt bei ${playerName(room, order[leaderIndex])}.`,
  };
}

function initializeGame(room) {
  const order = playerIds(room);
  const n = order.length;
  room.roundNo = 1;
  room.maxRound = Math.floor(60 / n);
  room.dealerIndex = 0;
  room.hostId = room.hostId || order[0];
  room.players = room.players || {};
  order.forEach((id, idx) => {
    room.players[id].seat = idx;
    room.players[id].score = room.players[id].score || 0;
  });
  const round = buildRoundState(room, 1);
  Object.assign(room, round);
  return room;
}

function finishRoundAndMaybeNext(room) {
  const order = playerIds(room);
  for (const id of order) {
    const bid = room.bids?.[id];
    const taken = room.tricksTaken?.[id] || 0;
    room.players[id].score = (room.players[id].score || 0) + scoreRound(bid ?? 0, taken);
  }

  if (room.roundNo >= room.maxRound) {
    room.phase = "finished";
    const winner = highestScoreWinner(room);
    room.winnerId = winner?.id || null;
    room.message = winner ? `${winner.name} gewinnt das Spiel!` : "Spiel beendet.";
    room.hands = {};
    room.currentTrick = [];
    room.bidStartIndex = null;
    room.turnIndex = null;
    return room;
  }

  const next = buildRoundState(room, room.roundNo + 1);
  Object.assign(room, next);
  return room;
}

function allBidsPlaced(room) {
  const order = playerIds(room);
  return order.every(id => room.bids && room.bids[id] !== null && room.bids[id] !== undefined);
}

function validBidOptions(room, playerId) {
  const round = roundSize(room);
  const order = playerIds(room);
  const bidderIndex = order.indexOf(playerId);
  const lastBidderIndex = (room.bidStartIndex + order.length - 1) % order.length;
  const isLast = bidderIndex === lastBidderIndex;
  
  const existing = order.reduce((sum, id) => {
    if (id === playerId) return sum;
    const v = room.bids?.[id];
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const options = [];
  for (let b = 0; b <= round; b++) {
    if (isLast && (existing + b) === round) continue;
    options.push(b);
  }
  return options;
}

function roomRef(roomCode) {
  return ref(db, `rooms/${roomCode}`);
}

function setLocalName(name) {
  currentName = name;
  localStorage.setItem(LOCAL.playerName, name);
  els.nameInput.value = name;
}

function showJoinView(show) {
  els.joinView.classList.toggle("hidden", !show);
  els.gameView.classList.toggle("hidden", show);
  els.leaveBtn.classList.toggle("hidden", show);
}

function setStatusText(state) {
  els.roomLabel.textContent = currentRoomCode || "—";
  els.phaseLabel.textContent = nicePhase(state?.phase);
  els.roundLabel.textContent = state?.roundNo ? `${state.roundNo}/${state.maxRound || "—"}` : "—";
  els.trumpLabel.textContent = renderTrump(state);
  els.turnLabel.textContent = state ? playerName(state, currentTurnPlayerId(state)) : "—";
  els.dealerLabel.textContent = state ? playerName(state, dealerPlayerId(state)) : "—";
}

function nicePhase(phase) {
  const map = {
    lobby: "Lobby",
    choose_trump: "Trumpf wählen",
    bidding: "Ansagen",
    playing: "Spielzug",
    finished: "Fertig"
  };
  return map[phase] || (phase || "—");
}

function renderTrump(state) {
  if (!state?.trumpCard) return "—";
  if (state.trumpCard.kind === "wizard") return "Wahl";
  if (state.trumpCard.kind === "jester") return "Kein";
  return SUIT_BY_KEY[state.trumpCard.suit]?.short || "—";
}

function renderRoom(state) {
  roomCache = state;
  setStatusText(state);

  const order = playerIds(state);
  els.playersList.innerHTML = "";
  const meIsHost = state.hostId === currentPlayerId;
  const meIsInGame = !!state.players?.[currentPlayerId];
  const currentTurn = currentTurnPlayerId(state);

  order.forEach((id, index) => {
    const p = state.players[id];
    const row = document.createElement("div");
    row.className = "playerRow";
    row.innerHTML = `
      <div class="name">${escapeHtml(p.name)} ${id === currentPlayerId ? '<span class="badge me">Ich</span>' : ''} ${p.isBot ? '<span class="badge bot">Bot</span>' : ''} ${state.hostId === id ? '<span class="badge host">Host</span>' : ''}</div>
      <div>${Number(p.score || 0)} P</div>
      <div>${Number(state.tricksTaken?.[id] || 0)} St.</div>
      <div>${currentTurn === id ? (state.phase === "bidding" ? '<span class="badge">Ansage</span>' : '<span class="badge">Zug</span>') : ''}</div>
    `;
    els.playersList.appendChild(row);
  });

  renderBids(state);
  renderTrick(state);
  renderHand(state);
  renderScores(state);
  renderLeaderboard(state);

  els.startBtn.disabled = !(meIsHost && state.phase === "lobby" && order.length >= 3 && order.length <= MAX_PLAYERS);
  els.resetBtn.disabled = !meIsHost && state.phase !== "lobby";
  els.addBotBtn.disabled = !(meIsHost && state.phase === "lobby");
  els.fillBotsBtn.disabled = !(meIsHost && state.phase === "lobby");

  els.bidControls.classList.toggle("hidden", !(state.phase === "bidding" && currentTurn === currentPlayerId && meIsInGame && !state.players[currentPlayerId]?.isBot));
  els.trumpChoiceControls.classList.toggle("hidden", !(state.phase === "choose_trump" && dealerPlayerId(state) === currentPlayerId && !state.players[currentPlayerId]?.isBot));
  
  if (state.phase === "bidding" && currentTurn === currentPlayerId) {
    const options = validBidOptions(state, currentPlayerId);
    els.bidHint.textContent = `Erlaubt: ${options.join(", ")}`;
    els.bidInput.min = "0";
    els.bidInput.max = String(roundSize(state));
    if (!els.bidInput.value) els.bidInput.value = String(Math.min(roundSize(state), Math.round(roundSize(state) / 2)));
  } else {
    els.bidHint.textContent = "";
  }

  els.biddingInfo.textContent = state.message || (state.phase === "bidding"
    ? `Die Ansage beginnt bei ${playerName(state, currentTurnPlayerId(state))}.`
    : state.phase === "choose_trump"
      ? `Der Geber ${playerName(state, dealerPlayerId(state))} wählt jetzt die Trumpffarbe.`
      : state.phase === "playing"
        ? `Es wird im Uhrzeigersinn gespielt.`
        : state.phase === "finished"
          ? `Spiel beendet.`
          : `Lobby.`);

  els.handHint.textContent = state.phase === "playing"
    ? (currentTurn === currentPlayerId ? "Du bist dran. Tippe eine Karte." : `Warten auf ${playerName(state, currentTurn)}.`)
    : state.phase === "bidding"
      ? (currentTurn === currentPlayerId ? "Du musst deine Ansage senden." : `Warten auf ${playerName(state, currentTurn)}.`)
      : state.phase === "choose_trump"
        ? (dealerPlayerId(state) === currentPlayerId ? "Du darfst Trumpf wählen." : `Warten auf ${playerName(state, dealerPlayerId(state))}.`)
        : "Keine Kartenphase.";

  els.trickInfo.textContent = state.phase === "playing"
    ? `Stiche in dieser Runde: ${state.trickCount}/${roundSize(state)}`
    : "";

  els.finishInfo.textContent = state.phase === "finished"
    ? `Gewinner: ${state.winnerId ? playerName(state, state.winnerId) : "—"}`
    : "";
    
  if (
    state.phase !== "playing" &&
    state.phase !== "bidding" &&
    state.phase !== "choose_trump"
  ) {
    overlayAlreadyShown = false;
  }

  if (
    state.phase === "playing" &&
    state.trickCount === state.roundNo &&
    !overlayAlreadyShown
  ) {
    overlayAlreadyShown = true;

    setTimeout(() => {
      showRoundOverlay(state);
    }, 900);
  }

  els.nextRoundBtn.classList.toggle("hidden", state.phase !== "finished");
  els.nextRoundBtn.disabled = !(state.phase === "finished" && state.hostId === currentPlayerId);

  maybeScheduleBot(state);
}

function renderBids(state) {
  els.bidsList.innerHTML = "";
  const order = playerIds(state);
  order.forEach((id) => {
    const bid = state.bids?.[id];
    const row = document.createElement("div");
    row.className = "listItem";
    row.innerHTML = `<span>${escapeHtml(playerName(state, id))}</span><strong>${bid === null || bid === undefined ? "—" : bid}</strong>`;
    els.bidsList.appendChild(row);
  });
}

function renderTrick(state) {
  els.trickTable.innerHTML = "";
  const trick = currentTrick(state);
  if (!trick.length) {
    els.trickTable.innerHTML = `<div class="hint">Noch keine Karten im Stich.</div>`;
    return;
  }
  trick.forEach(play => els.trickTable.appendChild(makeCardElement(play.card, play.playerId === currentPlayerId)));
}

function renderHand(state) {
  els.hand.innerHTML = "";
  const hand = handOf(state, currentPlayerId);
  if (!hand.length) {
    els.hand.innerHTML = `<div class="hint">Keine Handkarten sichtbar.</div>`;
    return;
  }

  const legal = legalCards(hand, currentTrick(state), state.trumpSuit);
  const legalIds = new Set(legal.map(c => c.id));
  const myTurn = currentTurnPlayerId(state) === currentPlayerId;
  const playable = state.phase === "playing" && myTurn;

  hand.forEach(card => {
    const el = makeCardElement(card, true);
    const allowed = legalIds.has(card.id);
    el.classList.toggle("clickable", playable && allowed);
    el.classList.toggle("disabled", playable && !allowed);
    if (playable && allowed) {
      el.addEventListener("click", () => playCard(card.id));
    }
    els.hand.appendChild(el);
  });
}

function renderScores(state) {
  els.scores.innerHTML = "";
  const rows = (playerIds(state).map(id => {
    const p = state.players[id];
    return {
      id,
      name: p.name,
      score: Number(p.score || 0),
      bid: state.bids?.[id],
      took: Number(state.tricksTaken?.[id] || 0)
    };
  })).sort((a, b) => b.score - a.score);

  const head = document.createElement("div");
  head.className = "scoreRow";
  head.innerHTML = `<div><strong>Name</strong></div><div><strong>Pkt</strong></div><div><strong>Ans.</strong></div><div><strong>St.</strong></div>`;
  els.scores.appendChild(head);

  rows.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "scoreRow";
    row.innerHTML = `
      <div class="${state.phase === "finished" && state.winnerId === r.id ? "winner" : ""}">${escapeHtml(r.name)}</div>
      <div>${r.score}</div>
      <div>${r.bid ?? "—"}</div>
      <div>${r.took}</div>
    `;
    els.scores.appendChild(row);
  });
}

function makeCardElement(card, showPlayerTag = false, playerTag = "") {
  const el = document.createElement("div");
  const cls = card.kind === "wizard" ? "specialWizard" : card.kind === "jester" ? "specialJester" : SUIT_BY_KEY[card.suit]?.css || "";
  el.className = `card ${cls}`;
  const suit = card.kind === "card" ? SUIT_BY_KEY[card.suit] : null;
  const top = card.kind === "card" ? suit.short : card.kind === "wizard" ? "🪄" : "🎭";
  const mid = card.kind === "card" ? card.rank : card.kind === "wizard" ? "Zauberer" : "Narr";
  const bot = card.kind === "card" ? suit.label : "";
  el.innerHTML = `
    <div class="top"><span>${top}</span><span>${showPlayerTag && playerTag ? escapeHtml(playerTag) : ""}</span></div>
    <div class="mid">${escapeHtml(String(mid))}</div>
    <div class="bot"><span>${escapeHtml(bot)}</span><span>${top}</span></div>
  `;
  return el;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;

  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
  }, 2200);

  setTimeout(() => {
    toast.remove();
  }, 2600);
}

function showRoundOverlay(state) {
  if (!state) return;

  els.roundResults.innerHTML = "";

  const rows = playerIds(state)
    .map(id => {
      const p = state.players[id];
      const bid = state.bids?.[id] ?? 0;
      const took = state.tricksTaken?.[id] ?? 0;

      const correct = bid === took;

      return {
        name: p.name,
        score: p.score || 0,
        bid,
        took,
        correct
      };
    })
    .sort((a, b) => b.score - a.score);

  rows.forEach((r, index) => {
    const div = document.createElement("div");
    div.className = `roundPlayer ${r.correct ? "success" : "fail"}`;

    div.innerHTML = `
      <div class="roundRank">#${index + 1}</div>

      <div class="roundName">
        ${escapeHtml(r.name)}
      </div>

      <div class="roundStats">
        Ansage ${r.bid} · Stich ${r.took}
      </div>

      <div class="roundScore">
        ${r.score} P
      </div>
    `;

    els.roundResults.appendChild(div);
  });

  els.roundOverlay.classList.remove("hidden");
}

function hideRoundOverlay() {
  els.roundOverlay.classList.add("hidden");
}

function renderLeaderboard(state) {
  if (!els.leaderboardList) return;
  if (!state?.players) return;

  els.leaderboardList.innerHTML = "";

  const players = Object.values(state.players)
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leaderboardRow";

    row.innerHTML = `
      <span>#${i + 1}</span>
      <span>${escapeHtml(p.name)}</span>
      <strong>${p.score || 0} P</strong>
    `;

    els.leaderboardList.appendChild(row);
  });
}

function roomStateOrDefault(roomCode, playerName, playerId) {
  return {
    roomCode,
    createdAt: Date.now(),
    hostId: playerId,
    phase: "lobby",
    roundNo: 0,
    maxRound: 0,
    dealerIndex: 0,
    leaderIndex: 0,
    turnIndex: 0,
    bidStartIndex: 0,
    currentBidOrderIndex: 0,
    currentTrick: [],
    trickCount: 0,
    bids: {},
    tricksTaken: {},
    hands: {},
    players: {
      [playerId]: {
        id: playerId,
        name: playerName,
        score: 0,
        isBot: false,
        seat: 0,
        connected: true
      }
    },
    order: [playerId],
    trumpCard: null,
    trumpSuit: null,
    pendingTrumpChoiceSeat: null,
    winnerId: null,
    message: "Lobby erstellt."
  };
}

async function joinOrCreateRoom(isCreate = false) {
  const name = getOrCreateName();
  if (!name) {
    alert("Bitte zuerst deinen Namen eingeben.");
    return;
  }
  const rawRoom = normalizeRoomCode(els.roomInput.value || localStorage.getItem(LOCAL.roomCode) || "");
  const roomCode = rawRoom || (isCreate ? randomRoomCode() : "");
  if (!roomCode) {
    alert("Bitte einen Raumcode eingeben oder einen neuen Raum erstellen.");
    return;
  }

  localStorage.setItem(LOCAL.roomCode, roomCode);
  currentRoomCode = roomCode;
  setLocalName(name);
  els.roomInput.value = roomCode;

  const roomReference = roomRef(roomCode);
  const result = await runTransaction(roomReference, (room) => {
    if (!room) {
      room = roomStateOrDefault(roomCode, name, currentPlayerId);
      room.createdAt = Date.now();
      return room;
    }

    room.players = room.players || {};
    room.order = Array.isArray(room.order) ? room.order : Object.keys(room.players);
    room.spectators = room.spectators || {};

    const alreadyPlayer = !!room.players[currentPlayerId];
    if (room.phase === "lobby" || alreadyPlayer) {
      if (!alreadyPlayer) {
        const count = room.order.length;
        if (count >= MAX_PLAYERS) return room;
        room.players[currentPlayerId] = {
          id: currentPlayerId,
          name,
          score: 0,
          isBot: false,
          seat: count,
          connected: true
        };
        room.order.push(currentPlayerId);
      } else {
        room.players[currentPlayerId].name = name;
        room.players[currentPlayerId].connected = true;
      }
      if (!room.hostId) room.hostId = room.order[0];
      return room;
    }

    if (!alreadyPlayer) {
      room.spectators[currentPlayerId] = { id: currentPlayerId, name, joinedAt: Date.now() };
      room.message = `${name} ist als Zuschauer beigetreten.`;
      return room;
    }
    room.players[currentPlayerId].name = name;
    room.players[currentPlayerId].connected = true;
    return room;
  });

  if (!result.committed) {
    alert("Raum konnte nicht betreten werden.");
    return;
  }

  showJoinView(false);
  listenToRoom(roomCode);
}

function listenToRoom(roomCode) {
  if (roomUnsub) roomUnsub();
  const roomReference = roomRef(roomCode);
  roomUnsub = onValue(roomReference, snapshot => {
    const state = snapshot.val();
    if (!state) return;
    roomCache = state;
    renderRoom(state);
  });
}

async function leaveRoom() {
  if (!currentRoomCode) return;
  
  const leaveConfirm = confirm("Möchtest du den Raum wirklich verlassen?");
  if (!leaveConfirm) return;

  const roomReference = roomRef(currentRoomCode);
  
  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }

  try {
    await runTransaction(roomReference, room => {
      if (!room) return room;

      if (room.players && room.players[currentPlayerId]) {
        delete room.players[currentPlayerId];
      }
      if (Array.isArray(room.order)) {
        room.order = room.order.filter(id => id !== currentPlayerId);
      }
      if (room.hands && room.hands[currentPlayerId]) {
        delete room.hands[currentPlayerId];
      }
      if (room.bids && room.bids[currentPlayerId] !== undefined) {
        delete room.bids[currentPlayerId];
      }
      if (room.tricksTaken && room.tricksTaken[currentPlayerId] !== undefined) {
        delete room.tricksTaken[currentPlayerId];
      }

      if (room.hostId === currentPlayerId) {
        const remainingPlayers = room.order ? room.order.filter(id => !id.startsWith("bot_")) : [];
        if (remainingPlayers.length > 0) {
          room.hostId = remainingPlayers[0];
          room.message = `Der bisherige Host hat den Raum verlassen. Neuer Host ist ${room.players[room.hostId]?.name || "Spieler"}.`;
        } else {
          return null;
        }
      } else {
        room.message = `${currentName || "Ein Spieler"} hat den Raum verlassen.`;
      }

      if (room.phase !== "lobby" && room.order && room.order.length > 0) {
        if (room.turnIndex >= room.order.length) room.turnIndex = 0;
        if (room.dealerIndex >= room.order.length) room.dealerIndex = 0;
        if (room.bidStartIndex >= room.order.length) room.bidStartIndex = 0;
      }

      return room;
    });
  } catch (e) {
    console.error("Fehler beim Verlassen:", e);
  }

  currentRoomCode = "";
  roomCache = null;
  localStorage.removeItem(LOCAL.roomCode);
  els.roomInput.value = "";
  showJoinView(true);
}

async function startGame() {
  if (!roomCache || roomCache.hostId !== currentPlayerId) return;
  const roomReference = roomRef(currentRoomCode);
  await runTransaction(roomReference, room => {
    if (!room) return room;
    const order = playerIds(room);
    if (order.length < 3 || order.length > MAX_PLAYERS) return room;
    if (room.phase !== "lobby") return room;
    return initializeGame(room);
  });
}

async function resetToLobby() {
  if (!roomCache || roomCache.hostId !== currentPlayerId) return;
  const roomReference = roomRef(currentRoomCode);
  await runTransaction(roomReference, room => {
    if (!room) return room;
    room.phase = "lobby";
    room.roundNo = 0;
    room.maxRound = 0;
    room.dealerIndex = 0;
    room.turnIndex = 0;
    room.bidStartIndex = 0;
    room.currentTrick = [];
    room.trickCount = 0;
    room.bids = {};
    room.tricksTaken = {};
    room.hands = {};
    room.trumpCard = null;
    room.trumpSuit = null;
    room.pendingTrumpChoiceSeat = null;
    winnerId = null;
    room.message = "Zur Lobby zurückgesetzt.";
    return room;
  });
}

async function addBot(count = 1) {
  if (!roomCache || roomCache.hostId !== currentPlayerId || roomCache.phase !== "lobby") return;
  const roomReference = roomRef(currentRoomCode);
  for (let i = 0; i < count; i++) {
    await runTransaction(roomReference, room => {
      if (!room || room.phase !== "lobby") return room;
      room.players = room.players || {};
      room.order = Array.isArray(room.order) ? room.order : [];
      if (room.order.length >= MAX_PLAYERS) return room;
      const name = BOT_NAMES.find(n => !Object.values(room.players).some(p => p.name === n)) || `Bot${room.order.length + 1}`;
      const botId = `bot_${uid()}`;
      room.players[botId] = {
        id: botId,
        name,
        score: 0,
        isBot: true,
        seat: room.order.length,
        connected: true
      };
      room.order.push(botId);
      room.message = `${name} wurde hinzugefügt.`;
      return room;
    });
  }
}

async function fillBotsTo3() {
  if (!roomCache || roomCache.hostId !== currentPlayerId || roomCache.phase !== "lobby") return;
  const missing = Math.max(0, 3 - playerIds(roomCache).length);
  await addBot(Math.min(missing, MAX_PLAYERS - playerIds(roomCache).length));
}

async function chooseTrumpSuit(suitKey) {
  if (!roomCache) return;
  const roomReference = roomRef(currentRoomCode);
  await runTransaction(roomReference, room => {
    if (!room || room.phase !== "choose_trump") return room;
    const currentTurn = currentTurnPlayerId(room);
    if (currentTurn !== currentPlayerId && !isBot(room, currentTurn)) return room;
    room.trumpSuit = suitKey;
    room.phase = "bidding";
    room.turnIndex = room.bidStartIndex;
    room.pendingTrumpChoiceSeat = null;
    room.message = `Trumpf: ${SUIT_BY_KEY[suitKey]?.label || "—"}. Ansage bei ${playerName(room, room.order[room.turnIndex])}`;
    return room;
  });
}

async function sendBid() {
  if (!roomCache) {
    alert("Fehler: Kein Raum-Cache vorhanden!");
    return;
  }
  
  let rawValue = els.bidInput.value;
  if (rawValue === "") rawValue = "0";
  const bidValue = parseInt(rawValue, 10);
  
  if (isNaN(bidValue)) {
    alert("Fehler: Keine gültige Zahl!");
    return;
  }
  
  const roomReference = roomRef(currentRoomCode);
  try {
    const result = await runTransaction(roomReference, room => {
      if (!room) return room;
      if (room.phase !== "bidding") return room;
      
      const order = playerIds(room);
      const bidderId = currentTurnPlayerId(room);
      if (bidderId !== currentPlayerId) return room;
      
      const allowed = validBidOptions(room, currentPlayerId);
      if (!allowed.includes(bidValue)) return room;
      
      if (!room.bids) room.bids = {};
      
      room.bids[currentPlayerId] = bidValue;
      
      const placedBidsCount = order.filter(id => room.bids[id] !== null && room.bids[id] !== undefined).length;
      room.currentBidOrderIndex = placedBidsCount;
      
      if (placedBidsCount >= order.length) {
        room.phase = "playing";
        room.turnIndex = room.leaderIndex;
        room.message = `Spielrunde läuft. ${playerName(room, room.order[room.turnIndex])} spielt aus.`;
        return room;
      }
      
      room.turnIndex = (room.bidStartIndex + placedBidsCount) % order.length;
      room.message = `Warten auf Ansage von ${playerName(room, room.order[room.turnIndex])}`;
      return room;
    });

  } catch (error) {
    alert("KRITISCHER FIREBASE FEHLER: " + error.message);
  }
}

async function playCard(cardId) {
  if (!roomCache) return;
  const roomReference = roomRef(currentRoomCode);
  await runTransaction(roomReference, room => {
    if (!room || room.phase !== "playing") return room;
    const order = playerIds(room);
    const turnPlayerId = currentTurnPlayerId(room);
    if (turnPlayerId !== currentPlayerId) return room;
    const hand = room.hands?.[currentPlayerId] || [];
    const card = hand.find(c => c.id === cardId);
    if (!card) return room;
    if (!isLegalPlay(card, hand, room.currentTrick || [], room.trumpSuit)) return room;

    room.hands[currentPlayerId] = hand.filter(c => c.id !== cardId);
    room.currentTrick = room.currentTrick || [];
    room.currentTrick.push({
      playerId: currentPlayerId,
      card
    });

    if (room.currentTrick.length >= order.length) {
      const winnerId = determineTrickWinner(room.currentTrick, room.trumpSuit);
      room.tricksTaken[winnerId] = (room.tricksTaken[winnerId] || 0) + 1;
      room.trickCount = (room.trickCount || 0) + 1;
      room.currentTrick = [];
      room.turnIndex = order.indexOf(winnerId);

      if (room.trickCount >= room.roundNo) {
        room = finishRoundAndMaybeNext(room);
      } else {
        room.message = `${playerName(room, winnerId)} gewinnt den Stich.`;
        setTimeout(() => {
          showToast(`${playerName(room, winnerId)} gewinnt den Stich`);
        }, 50);
      }
      return room;
    }

    room.turnIndex = (room.turnIndex + 1) % order.length;
    room.message = `${playerName(room, order[room.turnIndex])} ist am Zug.`;
    return room;
  });
}

async function nextRound() {
  if (!roomCache || roomCache.hostId !== currentPlayerId || roomCache.phase !== "finished") return;
  const roomReference = roomRef(currentRoomCode);
  await runTransaction(roomReference, room => {
    if (!room || room.phase !== "finished") return room;
    room.phase = "lobby";
    room.roundNo = 0;
    room.maxRound = 0;
    room.dealerIndex = 0;
    room.turnIndex = 0;
    room.bidStartIndex = 0;
    room.currentTrick = [];
    room.trickCount = 0;
    room.bids = {};
    room.tricksTaken = {};
    room.hands = {};
    room.trumpCard = null;
    room.trumpSuit = null;
    room.pendingTrumpChoiceSeat = null;
    room.winnerId = null;
    room.message = "Neue Partie bereit.";
    return room;
  });
}

function maybeScheduleBot(state) {
  if (!state) return;
  const order = playerIds(state);
  const botId = currentTurnPlayerId(state);

  if (!botId || !isBot(state, botId)) return;

  const key = `${state.phase}:${state.roundNo}:${state.turnIndex}:${Object.keys(state.bids || {}).length}:${state.trickCount}:${state.currentTrick?.length}`;
  if (botTimerKey === key) return;
  botTimerKey = key;

  window.setTimeout(async () => {
    const fresh = roomCache;
    if (!fresh) return;
    const currentBotId = currentTurnPlayerId(fresh);
    if (!currentBotId || !isBot(fresh, currentBotId)) return;

    if (fresh.phase === "choose_trump") {
      await chooseTrumpSuit(botTrumpChoice(fresh, currentBotId));
      return;
    }

    if (fresh.phase === "bidding") {
      const choice = botBid(fresh, currentBotId);
      await runTransaction(roomRef(currentRoomCode), room => {
        if (!room || room.phase !== "bidding") return room;
        const bidder = currentTurnPlayerId(room);
        if (bidder !== currentBotId) return room;
        const allowed = validBidOptions(room, currentBotId);
        if (!allowed.includes(choice)) return room;
        
        if (!room.bids) room.bids = {};
        room.bids[currentBotId] = choice;
        
        const placedBidsCount = order.filter(id => room.bids[id] !== null && room.bids[id] !== undefined).length;
        room.currentBidOrderIndex = placedBidsCount;
        
        if (placedBidsCount >= order.length) {
          room.phase = "playing";
          room.turnIndex = room.leaderIndex;
          room.message = `Spielrunde läuft. ${playerName(room, room.order[room.turnIndex])} spielt aus.`;
          return room;
        }
        room.turnIndex = (room.bidStartIndex + placedBidsCount) % order.length;
        room.message = `Warten auf Ansage von ${playerName(room, room.order[room.turnIndex])}`;
        return room;
      });
      return;
    }

    if (fresh.phase === "playing") {
      const card = botChoosePlay(fresh, currentBotId);
      if (card) {
        await runTransaction(roomRef(currentRoomCode), room => {
          if (!room || room.phase !== "playing") return room;
          const turnPlayer = currentTurnPlayerId(room);
          if (turnPlayer !== currentBotId) return room;
          const handNow = room.hands?.[currentBotId] || [];
          const actual = handNow.find(c => c.id === card.id);
          if (!actual) return room;
          if (!isLegalPlay(actual, handNow, room.currentTrick || [], room.trumpSuit)) return room;

          room.hands[currentBotId] = handNow.filter(c => c.id !== actual.id);
          room.currentTrick = room.currentTrick || [];
          room.currentTrick.push({ playerId: currentBotId, card: actual });

          const orderNow = playerIds(room);
          if (room.currentTrick.length >= orderNow.length) {
            const winnerId = determineTrickWinner(room.currentTrick, room.trumpSuit);
            room.tricksTaken[winnerId] = (room.tricksTaken[winnerId] || 0) + 1;
            room.trickCount = (room.trickCount || 0) + 1;
            room.currentTrick = [];
            room.turnIndex = orderNow.indexOf(winnerId);
            if (room.trickCount >= room.roundNo) {
              room = finishRoundAndMaybeNext(room);
            } else {
              room.message = `${playerName(room, winnerId)} gewinnt den Stich.`;
            }
          } else {
            room.turnIndex = (room.turnIndex + 1) % orderNow.length;
            room.message = `${playerName(room, orderNow[room.turnIndex])} ist am Zug.`;
          }
          return room;
        });
      }
    }
  }, 650 + Math.random() * 500);
}

function maybeFillLocalRoomCode() {
  const saved = localStorage.getItem(LOCAL.roomCode);
  if (saved) els.roomInput.value = saved;
  if (currentName) els.nameInput.value = currentName;
}

els.joinBtn.addEventListener("click", () => joinOrCreateRoom(false));
els.createBtn.addEventListener("click", () => {
  els.roomInput.value = randomRoomCode();
  joinOrCreateRoom(true);
});
els.startBtn.addEventListener("click", startGame);
els.resetBtn.addEventListener("click", resetToLobby);
els.addBotBtn.addEventListener("click", () => addBot(1));
els.fillBotsBtn.addEventListener("click", fillBotsTo3);
els.bidBtn.addEventListener("click", sendBid);
els.leaveBtn.addEventListener("click", leaveRoom);
els.nextRoundBtn.addEventListener("click", nextRound);
els.closeOverlayBtn?.addEventListener("click", hideRoundOverlay);

document.querySelectorAll(".suitChoice").forEach(btn => {
  btn.addEventListener("click", () => chooseTrumpSuit(btn.dataset.suit));
});
els.copyRoomBtn.addEventListener("click", async () => {
  if (!currentRoomCode) return;
  await navigator.clipboard.writeText(currentRoomCode);
  els.copyRoomBtn.textContent = "Kopiert!";
  setTimeout(() => (els.copyRoomBtn.textContent = "Code kopieren"), 1000);
});
els.shareBtn.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  if (currentRoomCode) url.searchParams.set("room", currentRoomCode);
  const text = `Wizard Raum: ${currentRoomCode || ""} ${url.toString()}`;
  if (navigator.share) {
    try { await navigator.share({ title: "Wizard Online", text, url: url.toString() }); } catch {}
  } else {
    await navigator.clipboard.writeText(url.toString());
    alert("Link kopiert.");
  }
});

els.roomInput.value = normalizeRoomCode(new URLSearchParams(location.search).get("room") || localStorage.getItem(LOCAL.roomCode) || "");
maybeFillLocalRoomCode();

const savedRoom = normalizeRoomCode(new URLSearchParams(location.search).get("room") || localStorage.getItem(LOCAL.roomCode) || "");
if (savedRoom) {
  currentRoomCode = savedRoom;
  currentName = currentName || "Spieler";
  if (els.nameInput.value) currentName = els.nameInput.value;
  showJoinView(false);
  listenToRoom(savedRoom);
}

window.addEventListener("beforeunload", () => {
  if (currentRoomCode) localStorage.setItem(LOCAL.roomCode, currentRoomCode);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement === els.nameInput || e.key === "Enter" && document.activeElement === els.roomInput) {
    if (els.gameView.classList.contains("hidden")) joinOrCreateRoom(false);
  }
});
