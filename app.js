import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  update,
  get,
  push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2; 
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
  trumpChoiceHint: document.querySelector("#trumpChoiceControls .hint"),
  bidBtn: document.getElementById("bidBtn"),
  bidMinusBtn: document.getElementById("bidMinusBtn"),
  bidPlusBtn: document.getElementById("bidPlusBtn"),
  bidDisplay: document.getElementById("bidDisplay"),
  bidHint: document.getElementById("bidHint"),
  biddingInfo: document.getElementById("biddingInfo"),
  nextRoundBtn: document.getElementById("nextRoundBtn"),
  roundOverlay: document.getElementById("roundOverlay"),
  roundResults: document.getElementById("roundResults"),
  closeOverlayBtn: document.getElementById("closeOverlayBtn"),
  leaderboardList: document.getElementById("leaderboardList"),
  toastContainer: document.getElementById("toastContainer"),
  anniversaryCheck: document.getElementById("anniversaryCheck"),
  strictBidCheck: document.getElementById("strictBidCheck"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsOverlay: document.getElementById("settingsOverlay"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  statsOverlay: document.getElementById("statsOverlay"),
  closeStatsBtn: document.getElementById("closeStatsBtn"),
  statsContent: document.getElementById("statsContent")
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
let overlayAlreadyShown = false;
let currentSelectedBid = 0;

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

  if (roomCache && roomCache.anniversaryMode) {
    deck.push({ id: uid(), kind: "dragon", label: "Drache" });
    deck.push({ id: uid(), kind: "pixie", label: "Fee" });
    deck.push({ id: uid(), kind: "bomb", label: "Bombe" });
    deck.push({ id: uid(), kind: "werewolf", label: "Werwolf" });
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

function updateBidDisplay() {
  if (els.bidDisplay) {
    els.bidDisplay.textContent = currentSelectedBid;
  }
}

function handOf(room, playerId) {
  return room.hands?.[playerId] || [];
}

function sortHand(hand) {
  return hand.slice().sort((a, b) => {
    const kindOrder = { "wizard": 1, "dragon": 2, "werewolf": 3, "pixie": 4, "bomb": 5, "jester": 6, "card": 7 };
    if (kindOrder[a.kind] !== kindOrder[b.kind]) {
      return kindOrder[a.kind] - kindOrder[b.kind];
    }
    if (a.kind === "card" && b.kind === "card") {
      const suitOrder = { "spades": 1, "hearts": 2, "clubs": 3, "diamonds": 4 };
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return a.rank - b.rank;
    }
    return 0;
  });
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
  if (card.kind === "dragon") return "Drache";
  if (card.kind === "pixie") return "Fee";
  if (card.kind === "bomb") return "Bombe";
  if (card.kind === "werewolf") return "Werwolf";
  const suit = SUIT_BY_KEY[card.suit];
  return `${suit ? suit.short : "?"} ${card.rank}`;
}

function cardStrength(card, trumpSuit, ledSuit) {
  if (card.kind === "dragon") return 1500;
  if (card.kind === "wizard") return 1000;
  if (card.kind === "jester") return -1000;
  if (card.kind === "werewolf") return -1000;
  if (card.kind === "pixie") return -1500;
  if (card.kind === "bomb") return -2000;
  let v = card.rank;
  if (trumpSuit && trumpSuit !== "none" && card.suit === trumpSuit) v += 100;
  else if (ledSuit && card.suit === ledSuit) v += 50;
  return v;
}

function getLedSuit(trick) {
  for (const play of trick || []) {
    if (play.card?.kind === "dragon" || play.card?.kind === "wizard") return { wizardLed: true, ledSuit: null };
    if (play.card?.kind === "jester" || play.card?.kind === "werewolf" || play.card?.kind === "pixie" || play.card?.kind === "bomb") continue; 
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

  const hasDragon = trick.some(play => play.card.kind === "dragon");
  const hasPixie = trick.some(play => play.card.kind === "pixie");

  if (hasDragon && hasPixie) {
    return trick.find(play => play.card.kind === "pixie").playerId;
  }

  const firstDragon = trick.find(play => play.card.kind === "dragon");
  if (firstDragon) return firstDragon.playerId;

  const firstWizard = trick.find(play => play.card.kind === "wizard");
  if (firstWizard) return firstWizard.playerId;

  const allLow = trick.every(play => play.card.kind === "jester" || play.card.kind === "werewolf" || play.card.kind === "pixie" || play.card.kind === "bomb");
  if (allLow) return trick[0].playerId;

  const led = trick.find(play => play.card.kind === "card");
  const ledSuit = led?.card?.suit || null;

  const trumpPlays = (trumpSuit && trumpSuit !== "none")
    ? trick.filter(play => play.card.kind === "card" && play.card.suit === trumpSuit)
    : [];

  const candidates = trumpPlays.length
    ? trumpPlays
    : trick.filter(play => play.card.kind === "card" && play.card.suit === ledSuit);

  if (!candidates.length) {
    return trick.find(play => play.card.kind === "jester" || play.card.kind === "werewolf" || play.card.kind === "bomb")?.playerId || trick[0].playerId;
  }

  return candidates.reduce((best, play) => {
    if (!best) return play;
    return (play.card.rank > best.card.rank) ? play : best;
  }, null).playerId;
}

function botStrengthForHand(hand, trumpSuit) {
  let score = 0;
  for (const card of hand) {
    if (card.kind === "dragon") score += 45;
    else if (card.kind === "wizard") score += 40;
    else if (card.kind === "jester") score -= 6;
    else if (card.kind === "werewolf") score -= 6;
    else if (card.kind === "pixie") score -= 8;
    else if (card.kind === "bomb") score -= 10;
    else {
      score += card.rank;
      if (trumpSuit && trumpSuit !== "none" && card.suit === trumpSuit) score += 10;
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
  let trumpCard = deck[order.length * size] || null;
  const dealerIndex = roundDealerIndex(room, roundNo);
  const leaderIndex = (dealerIndex + 1) % order.length;
  
  let phase = "bidding";
  let turnIndex = leaderIndex;
  let pendingTrumpChoiceSeat = null;
  let message = `Ansage beginnt bei ${playerName(room, order[leaderIndex])}.`;

  let werewolfPlayerId = null;
  let werewolfCardIndex = -1;
  
  if (trumpCard) {
    for (const id of order) {
      const idx = hands[id].findIndex(c => c.kind === "werewolf");
      if (idx !== -1) {
        werewolfPlayerId = id;
        werewolfCardIndex = idx;
        break;
      }
    }
  }

  if (werewolfPlayerId && trumpCard) {
    const wwCard = hands[werewolfPlayerId][werewolfCardIndex];
    hands[werewolfPlayerId][werewolfCardIndex] = trumpCard;
    trumpCard = wwCard;
    
    phase = "choose_trump";
    turnIndex = order.indexOf(werewolfPlayerId);
    pendingTrumpChoiceSeat = turnIndex;
    message = `🐺 ${playerName(room, werewolfPlayerId)} tauscht Werwolf und wählt Trumpf.`;
  } 
  else if (trumpCard?.kind === "werewolf") {
    phase = "choose_trump";
    turnIndex = dealerIndex;
    pendingTrumpChoiceSeat = dealerIndex;
    message = `🐺 Werwolf aufgedeckt! Geber ${playerName(room, order[dealerIndex])} wählt Trumpf.`;
  }
  else if (trumpCard?.kind === "wizard" || trumpCard?.kind === "dragon") {
    phase = "choose_trump";
    turnIndex = dealerIndex;
    pendingTrumpChoiceSeat = dealerIndex;
    message = `${playerName(room, order[dealerIndex])} darf die Trumpffarbe wählen.`;
  }
  
  const trumpSuit = (trumpCard?.kind === "card") ? trumpCard.suit : null;

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
    turnIndex,
    bidStartIndex: (dealerIndex + 1) % order.length,
    currentBidOrderIndex: 0,
    currentTrick: [],
    trickCount: 0,
    bids,
    tricksTaken,
    hands,
    trumpCard,
    trumpSuit,
    trickReadyToClear: false, 
    pendingTrumpChoiceSeat,
    message
  };
}

function initializeGame(room) {
  const order = playerIds(room);
  const n = order.length;
  room.roundNo = 1;
  room.maxRound = n === 2 ? 20 : Math.floor(60 / n);
  room.dealerIndex = 0;
  room.hostId = room.hostId || order[0];
  room.players = room.players || {};
  room.scoreHistory = [];
  
  order.forEach((id, idx) => {
    room.players[id].seat = idx;
    room.players[id].score = room.players[id].score || 0;
  });
  const round = buildRoundState(room, 1);
  Object.assign(room, round);
  return room;
}

async function savePlayerStats(room) {
  const order = playerIds(room);
  
  for (const id of order) {
    const p = room.players[id];
    if (p.isBot) continue; 
    
    const cleanName = p.name.replace(/[.#$[\]]/g, "_");
    const userScoreRef = ref(db, `global_leaderboard/${cleanName}`);
    const isWinner = room.winnerId === id;
    
    try {
      await runTransaction(userScoreRef, (currentData) => {
        const data = currentData || { wins: 0, gamesPlayed: 0, maxScore: 0, totalScore: 0 };
        
        if (typeof data === 'number') {
          return {
            wins: data + (isWinner ? 1 : 0),
            gamesPlayed: 1,
            maxScore: p.score,
            totalScore: p.score
          };
        }
        
        data.gamesPlayed = (data.gamesPlayed || 0) + 1;
        data.totalScore = (data.totalScore || 0) + p.score;
        
        if (isWinner) {
          data.wins = (data.wins || 0) + 1;
        }
        
        if (p.score > (data.maxScore || 0)) {
          data.maxScore = p.score;
        }
        
        return data;
      });
    } catch (e) {
      console.error("Fehler beim Speichern der Statistiken für", p.name, e);
    }
  }
  fetchGlobalLeaderboard();
}

function finishRoundAndMaybeNext(room) {
  const order = playerIds(room);
  const roundPoints = {};

  for (const id of order) {
    const bid = room.bids?.[id] ?? 0;
    const taken = room.tricksTaken?.[id] || 0;
    const diff = scoreRound(bid, taken);
    
    room.players[id].score = (room.players[id].score || 0) + diff;
    roundPoints[id] = diff;
  }

  if (!room.scoreHistory) room.scoreHistory = [];
  room.scoreHistory.push({
    roundNo: room.roundNo,
    points: roundPoints
  });

  if (room.roundNo >= room.maxRound) {
    room.phase = "finished";
    const winner = highestScoreWinner(room);
    room.winnerId = winner?.id || null;
    room.message = winner ? `${winner.name} gewinnt das Spiel!` : "Spiel beendet.";
    room.hands = {};
    room.currentTrick = [];
    room.bidStartIndex = null;
    room.turnIndex = null;
    
    savePlayerStats(room);
    
    return room;
  }

  room.phase = "round_summary";
  room.message = "Runde beendet! Der Host startet gleich die nächste Runde.";
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
  
  const isStrict = room.strictBidRule !== false;

  const existing = order.reduce((sum, id) => {
    if (id === playerId) return sum;
    const v = room.bids?.[id];
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const options = [];
  for (let b = 0; b <= round; b++) {
    if (isStrict && isLast && (existing + b) === round) continue;
    options.push(b);
  }
  
  if (options.length === 0) {
    options.push(0);
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
  els.settingsBtn?.classList.toggle("hidden", show);
  if (show) {
    fetchGlobalLeaderboard();
  }
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
    round_summary: "Rundenende",
    finished: "Fertig"
  };
  return map[phase] || (phase || "—");
}

function renderTrump(state) {
  if (!state?.trumpCard) return "—";
  if (state.trumpCard.kind === "wizard" || state.trumpCard.kind === "dragon" || state.trumpCard.kind === "werewolf") {
     if (state.trumpSuit === "none") return "Wahl: Kein";
     if (state.trumpSuit && state.phase !== "choose_trump") {
         return "Wahl: " + (SUIT_BY_KEY[state.trumpSuit]?.short || "");
     }
     return "Wahl";
  }
  if (state.trumpCard.kind === "jester" || state.trumpCard.kind === "pixie" || state.trumpCard.kind === "bomb") return "Kein";
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
      <div>${currentTurn === id && !state.trickReadyToClear ? (state.phase === "bidding" ? '<span class="badge">Ansage</span>' : '<span class="badge">Zug</span>') : ''}</div>
    `;
    els.playersList.appendChild(row);
  });

  renderBids(state);
  renderTrick(state);
  renderHand(state);
  renderScores(state);

  els.startBtn.disabled = !(meIsHost && state.phase === "lobby" && order.length >= MIN_PLAYERS && order.length <= MAX_PLAYERS);
  els.resetBtn.disabled = !meIsHost && state.phase !== "lobby";
  els.addBotBtn.disabled = !(meIsHost && state.phase === "lobby");
  els.fillBotsBtn.disabled = !(meIsHost && state.phase === "lobby");

  if (els.anniversaryCheck) {
    els.anniversaryCheck.checked = !!state.anniversaryMode;
    els.anniversaryCheck.disabled = !(meIsHost && state.phase === "lobby");
  }
  
  if (els.strictBidCheck) {
    els.strictBidCheck.checked = state.strictBidRule !== false;
    els.strictBidCheck.disabled = !(meIsHost && state.phase === "lobby");
  }

  const isMyBiddingTurn = (state.phase === "bidding" && currentTurn === currentPlayerId && meIsInGame && !state.players[currentPlayerId]?.isBot && !state.trickReadyToClear);
  els.bidControls.classList.toggle("hidden", !isMyBiddingTurn);
  
  els.trumpChoiceControls.classList.toggle("hidden", !(state.phase === "choose_trump" && state.pendingTrumpChoiceSeat === order.indexOf(currentPlayerId) && !state.players[currentPlayerId]?.isBot));
  
  if (isMyBiddingTurn) {
    const options = validBidOptions(state, currentPlayerId);
    els.bidHint.textContent = `Erlaubt: ${options.join(", ")}`;
    
    if (currentSelectedBid > roundSize(state)) {
      currentSelectedBid = 0;
    }
    updateBidDisplay();
  } else {
    els.bidHint.textContent = "";
  }

  let trumpChoiceMsg = "Zauberer aufgedeckt — Trumpf wählen";
  
  if (state.trumpCard?.kind === "werewolf") {
      trumpChoiceMsg = "🐺 Aaaauuu! Werwolf aufgedeckt — Wähle schnell einen Trumpf!";
  } else if (state.trumpCard?.kind === "dragon") {
      trumpChoiceMsg = "🐉 Roaaar! Drache aufgedeckt — Trumpf wählen";
  }

  if (els.trumpChoiceHint) {
      els.trumpChoiceHint.textContent = trumpChoiceMsg;
  }

  els.biddingInfo.textContent = state.message || (state.phase === "bidding"
    ? `Die Ansage beginnt bei ${playerName(state, order[state.bidStartIndex])}.`
    : state.phase === "choose_trump"
      ? `${playerName(state, order[state.pendingTrumpChoiceSeat])} · ${trumpChoiceMsg}`
      : state.phase === "playing"
        ? `Es wird im Uhrzeigersinn gespielt.`
        : state.phase === "finished"
          ? `Spiel beendet.`
          : `Lobby.`);

  els.handHint.textContent = state.phase === "playing"
    ? (state.trickReadyToClear ? "Stich wird abgeräumt..." : (currentTurn === currentPlayerId ? "Du bist dran. Tippe eine Karte." : `Warten auf ${playerName(state, currentTurn)}.`))
    : state.phase === "bidding"
      ? (currentTurn === currentPlayerId ? "Du musst deine Ansage senden." : `Warten auf ${playerName(state, currentTurn)}.`)
      : state.phase === "choose_trump"
        ? (state.pendingTrumpChoiceSeat === order.indexOf(currentPlayerId) ? "Du darfst Trumpf wählen." : `Warten auf ${playerName(state, order[state.pendingTrumpChoiceSeat])}.`)
        : state.phase === "round_summary"
          ? "Runde vorbei! Ergebnisse werden angezeigt."
          : "Keine Kartenphase.";

  els.trickInfo.textContent = state.phase === "playing"
    ? `Stiche in dieser Runde: ${state.trickCount}/${roundSize(state)}`
    : "";

  els.finishInfo.textContent = state.phase === "finished"
    ? `Gewinner: ${state.winnerId ? playerName(state, state.winnerId) : "—"}`
    : "";
    
  if (state.phase === "round_summary") {
    if (!overlayAlreadyShown) {
      overlayAlreadyShown = true;
      setTimeout(() => {
        if (roomCache && roomCache.phase === "round_summary") {
          showRoundOverlay(roomCache);
        }
      }, 500);
    }
  } else {
    overlayAlreadyShown = false;
    hideRoundOverlay();
  }

  const isSummary = state.phase === "round_summary";
  const isFinished = state.phase === "finished";
  
  els.nextRoundBtn.classList.toggle("hidden", !isFinished);
  els.nextRoundBtn.disabled = !(isFinished && state.hostId === currentPlayerId);
  els.nextRoundBtn.textContent = "Neues Spiel";

  if (state.trickReadyToClear) {
    if (state.hostId === currentPlayerId) {
      if (!window.clearTrickTimeout) {
        window.clearTrickTimeout = setTimeout(async () => {
          window.clearTrickTimeout = null;
          await runTransaction(roomRef(currentRoomCode), r => {
            if (!r || !r.trickReadyToClear) return r;
            r.currentTrick = [];
            r.trickReadyToClear = false;
            r.turnIndex = r.order.indexOf(r.trickWinner);
            if (r.trickCount >= r.roundNo) {
              r = finishRoundAndMaybeNext(r);
            }
            return r;
          });
        }, 1800);
      }
    }
  } else {
    if (window.clearTrickTimeout) {
      clearTimeout(window.clearTrickTimeout);
      window.clearTrickTimeout = null;
    }
  }

  maybeScheduleBot(state);
}

function renderBids(state) {
  els.bidsList.innerHTML = "";
  const order = playerIds(state);
  order.forEach((id) => {
    const bid = state.bids?.[id];
    const taken = state.tricksTaken?.[id] || 0;
    
    let statusDisplay = "—";
    if (bid !== null && bid !== undefined) {
      if (state.phase === "playing" || state.phase === "round_summary") {
        statusDisplay = `${bid} / ${taken}`; 
      } else {
        statusDisplay = bid; 
      }
    }

    const row = document.createElement("div");
    row.className = "listItem";
    row.innerHTML = `<span>${escapeHtml(playerName(state, id))}</span><strong>${statusDisplay}</strong>`;
    els.bidsList.appendChild(row);
  });
}

function renderTrick(state) {
  els.trickTable.innerHTML = "";
  
  if (state.phase === "round_summary") {
    if (state.hostId === currentPlayerId) {
      const btn = document.createElement("button");
      btn.textContent = "Nächste Runde starten";
      btn.style.padding = "14px 28px";
      btn.style.fontSize = "1.05rem";
      btn.style.borderRadius = "18px";
      btn.style.animation = "cardFloat 3s ease-in-out infinite"; 
      btn.addEventListener("click", nextRound);
      els.trickTable.appendChild(btn);
    } else {
      els.trickTable.innerHTML = `<div class="hint" style="font-size:1rem; font-weight:600; color:var(--primary);">Warten auf Host für nächste Runde...</div>`;
    }
    return;
  }

  const trick = currentTrick(state);
  if (!trick.length) {
    els.trickTable.innerHTML = `<div class="hint">Noch keine Karten im Stich.</div>`;
    return;
  }
  trick.forEach(play => {
    const pName = playerName(state, play.playerId);
    els.trickTable.appendChild(makeCardElement(play.card, play.playerId === currentPlayerId, pName));
  });
}

function renderHand(state) {
  els.hand.innerHTML = "";
  
  const hand = sortHand(handOf(state, currentPlayerId));
  
  const handTitleEl = document.querySelector(".handTop h2");
  if (handTitleEl) {
    let trumpIndicator = "—";
    let badgeClass = "";
    if (state?.trumpCard) {
      if (state.trumpCard.kind === "wizard" || state.trumpCard.kind === "dragon" || state.trumpCard.kind === "werewolf") {
        let symbol = state.trumpCard.kind === "dragon" ? "🐉" : (state.trumpCard.kind === "werewolf" ? "🐺" : "🪄");
        
        if (state.trumpSuit === "none") {
          trumpIndicator = `${symbol} Kein Trumpf`;
          badgeClass = "badge host";
        } else if (state.trumpSuit && state.phase !== "choose_trump") {
          const suit = SUIT_BY_KEY[state.trumpSuit];
          trumpIndicator = `${symbol} ${suit?.short}`;
          badgeClass = `badge ${suit?.css || "bot"}`;
        } else {
          trumpIndicator = symbol + " Wahl";
          badgeClass = "badge bot";
        }
      } else if (state.trumpCard.kind === "jester" || state.trumpCard.kind === "pixie" || state.trumpCard.kind === "bomb") {
        trumpIndicator = (state.trumpCard.kind === "bomb" ? "💣" : state.trumpCard.kind === "pixie" ? "🧚" : "🎭") + " Kein";
        badgeClass = "badge host";
      } else {
        const suit = SUIT_BY_KEY[state.trumpCard.suit];
        trumpIndicator = `${suit?.short} ${suit?.label}`;
        badgeClass = `badge ${suit?.css || ""}`;
      }
    }
    handTitleEl.innerHTML = `Deine Karten <span class="${badgeClass}" style="margin-left: 8px; font-size: 0.8rem; padding: 3px 8px; vertical-align: middle;">Trumpf: ${trumpIndicator}</span>`;
  }

  if (!hand.length) {
    els.hand.innerHTML = `<div class="hint">Keine Handkarten sichtbar.</div>`;
    return;
  }

  const legal = legalCards(hand, currentTrick(state), state.trumpSuit);
  const legalIds = new Set(legal.map(c => c.id));
  const myTurn = currentTurnPlayerId(state) === currentPlayerId;
  const playable = state.phase === "playing" && myTurn && !state.trickReadyToClear;

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
  const order = playerIds(state);
  if (!order.length) return;

  const table = document.createElement("div");
  table.style.display = "flex";
  table.style.flexDirection = "column";
  table.style.width = "100%";
  table.style.fontSize = "0.8rem";
  table.style.border = "1px solid rgba(255,255,255,0.05)";
  table.style.borderRadius = "8px";
  table.style.overflow = "hidden";

  const gridTemplate = `1.2fr repeat(${order.length}, 1fr)`;

  const headRow = document.createElement("div");
  headRow.style.display = "grid";
  headRow.style.gridTemplateColumns = gridTemplate;
  headRow.style.background = "rgba(139, 92, 246, 0.15)";
  headRow.style.padding = "6px 4px";
  headRow.style.fontWeight = "bold";
  headRow.style.textAlign = "center";
  headRow.style.borderBottom = "1px solid rgba(255,255,255,0.1)";

  headRow.innerHTML = `<div style="text-align: left; padding-left: 4px; color: var(--text-muted);">Runde</div>`;
  order.forEach(id => {
    const isMe = id === currentPlayerId;
    headRow.innerHTML += `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${isMe ? 'color: var(--badge-me);' : ''}">${escapeHtml(playerName(state, id))}</div>`;
  });
  table.appendChild(headRow);

  const history = state.scoreHistory || [];
  history.forEach((hist, index) => {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = gridTemplate;
    row.style.padding = "4px";
    row.style.textAlign = "center";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
    if (index % 2 === 1) row.style.background = "rgba(255,255,255,0.01)";

    row.innerHTML = `<div style="text-align: left; padding-left: 4px; color: var(--text-muted);">R ${hist.roundNo}</div>`;
    order.forEach(id => {
      const pts = hist.points?.[id] ?? 0;
      const color = pts >= 0 ? "#10b981" : "#ef4444";
      const prefix = pts >= 0 ? "+" : "";
      row.innerHTML += `<div style="color: ${color};">${prefix}${pts}</div>`;
    });
    table.appendChild(row);
  });

  if (!history.length) {
    const emptyRow = document.createElement("div");
    emptyRow.style.padding = "8px";
    emptyRow.style.textAlign = "center";
    emptyRow.style.color = "var(--text-muted)";
    emptyRow.textContent = "Noch keine Runden-Daten vorhanden.";
    table.appendChild(emptyRow);
  }

  const totalRow = document.createElement("div");
  totalRow.style.display = "grid";
  totalRow.style.gridTemplateColumns = gridTemplate;
  totalRow.style.background = "rgba(0,0,0,0.3)";
  totalRow.style.padding = "6px 4px";
  totalRow.style.fontWeight = "bold";
  totalRow.style.textAlign = "center";
  totalRow.style.borderTop = "1px solid rgba(255,255,255,0.1)";

  totalRow.innerHTML = `<div style="text-align: left; padding-left: 4px; color: #fff;">Gesamt</div>`;
  order.forEach(id => {
    const totalScore = state.players?.[id]?.score ?? 0;
    totalRow.innerHTML += `<div style="color: #fff; font-size: 0.9rem;">${totalScore} P</div>`;
  });
  table.appendChild(totalRow);

  els.scores.appendChild(table);
}

function makeCardElement(card, showPlayerTag = false, playerTag = "") {
  const el = document.createElement("div");
  
  let cls = "";
  if (card.kind === "wizard") cls = "specialWizard";
  else if (card.kind === "jester") cls = "specialJester";
  else if (card.kind === "dragon") cls = "specialDragon";
  else if (card.kind === "pixie") cls = "specialPixie";
  else if (card.kind === "bomb") cls = "specialBomb";
  else if (card.kind === "werewolf") cls = "specialWerewolf";
  else cls = SUIT_BY_KEY[card.suit]?.css || "";

  el.className = `card ${cls}`;
  const suit = card.kind === "card" ? SUIT_BY_KEY[card.suit] : null;
  
  let top = "";
  if (card.kind === "card") top = suit.short;
  else if (card.kind === "wizard") top = "🪄";
  else if (card.kind === "jester") top = "🎭";
  else if (card.kind === "dragon") top = "🐉";
  else if (card.kind === "pixie") top = "🧚";
  else if (card.kind === "bomb") top = "💣";
  else if (card.kind === "werewolf") top = "🐺";

  el.innerHTML = `
    <div class="top"><span>${top}</span>${playerTag ? `<span class="cardOwnerTag">${escapeHtml(playerTag)}</span>` : ""}</div>
    <div class="mid">${escapeHtml(String(card.label))}</div>
    <div class="bot"><span>${card.kind === "card" ? suit.label : ""}</span><span>${top}</span></div>
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
      const took = state.tricksTaken?.[id] || 0;

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

function showPlayerStats(playerName, stats) {
  if (!els.statsOverlay) return;
  
  const wins = stats.wins || 0;
  const games = stats.gamesPlayed || (typeof stats === 'number' ? 1 : 0);
  const maxScore = stats.maxScore || "—";
  const totalScore = stats.totalScore || 0;
  
  let winRate = 0;
  if (games > 0) {
    winRate = Math.round((wins / games) * 100);
  }

  els.statsContent.innerHTML = `
    <h3 style="color: var(--primary); margin-bottom: 15px; font-size: 1.4rem; text-align: center;">${escapeHtml(playerName)}</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 5px;">Siege</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: #ca8a04;">🏆 ${wins}</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 5px;">Gespielt</div>
            <div style="font-size: 1.5rem; font-weight: bold;">🎲 ${games}</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 5px;">Siegquote</div>
            <div style="font-size: 1.5rem; font-weight: bold;">📈 ${winRate}%</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; text-align: center;">
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 5px;">Highscore</div>
            <div style="font-size: 1.5rem; font-weight: bold; color: #10b981;">⭐ ${maxScore}</div>
        </div>
    </div>
  `;
  
  els.statsOverlay.classList.remove("hidden");
}

async function fetchGlobalLeaderboard() {
  if (!els.leaderboardList) return;
  
  const leaderboardRef = ref(db, "global_leaderboard");
  try {
    const snapshot = await get(leaderboardRef);
    els.leaderboardList.innerHTML = "";
    
    if (!snapshot.exists()) {
      els.leaderboardList.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted);">Noch keine Siege registriert.</div>`;
      return;
    }

    const data = snapshot.val();
    
    const sortedEntries = Object.entries(data)
      .map(([name, stats]) => {
          if (typeof stats === 'number') {
              return { name, wins: stats, rawData: { wins: stats } };
          }
          return { name, wins: stats.wins || 0, rawData: stats };
      })
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);

    sortedEntries.forEach((player, idx) => {
      const row = document.createElement("div");
      row.className = "leaderboardItem clickableLeaderboard"; 
      row.style.cursor = "pointer";
      
      row.innerHTML = `
        <span>#${idx + 1} <strong>${escapeHtml(player.name)}</strong></span>
        <strong style="color: #ca8a04;">🏆 ${player.wins}</strong>
      `;
      
      row.addEventListener("click", () => showPlayerStats(player.name, player.rawData));
      
      els.leaderboardList.appendChild(row);
    });
  } catch (e) {
    console.error("Fehler beim Abrufen der Bestenliste:", e);
  }
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
    scoreHistory: [],
    anniversaryMode: false,
    strictBidRule: true, 
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
    trickReadyToClear: false,
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
      room.spectators[currentPlayerId] = { id: playerId, name, joinedAt: Date.now() };
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
    if (order.length < MIN_PLAYERS || order.length > MAX_PLAYERS) return room;
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
    room.scoreHistory = [];
    room.trumpCard = null;
    room.trumpSuit = null;
    room.trickReadyToClear = false;
    room.pendingTrumpChoiceSeat = null;
    room.winnerId = null;
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
    
    let currentTurn = currentTurnPlayerId(room);
    if (room.pendingTrumpChoiceSeat !== null && room.pendingTrumpChoiceSeat !== undefined) {
      currentTurn = room.order[room.pendingTrumpChoiceSeat];
    }

    if (currentTurn !== currentPlayerId && !isBot(room, currentTurn)) return room;
    
    room.trumpSuit = suitKey === "none" ? "none" : suitKey;
    room.phase = "bidding";
    room.turnIndex = room.bidStartIndex;
    room.pendingTrumpChoiceSeat = null;
    
    const suitName = suitKey === "none" ? "Kein Trumpf" : (SUIT_BY_KEY[suitKey]?.label || "—");
    room.message = `Trumpf: ${suitName}. Ansage bei ${playerName(room, room.order[room.turnIndex])}`;
    return room;
  });
}

async function sendBid() {
  if (!roomCache) return;
  
  const bidValue = currentSelectedBid;
  const roomReference = roomRef(currentRoomCode);
  
  try {
    await runTransaction(roomReference, room => {
      if (!room || room.phase !== "bidding") return room;
      
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
    
    const allowed = validBidOptions(roomCache, currentPlayerId);
    if (!allowed.includes(bidValue)) {
        alert("Diese Ansage ist gemäß der +1 Regel nicht erlaubt!");
        return;
    }
    
    currentSelectedBid = 0;

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
      const hasBomb = room.currentTrick.some(p => p.card.kind === "bomb");
      
      if (!hasBomb) {
        room.tricksTaken[winnerId] = (room.tricksTaken[winnerId] || 0) + 1;
      }
      room.trickCount = (room.trickCount || 0) + 1;
      
      room.trickReadyToClear = true;
      room.trickWinner = winnerId;

      if (hasBomb) {
        room.message = `💣 BUMM! Stich zerstört. ${playerName(room, winnerId)} darf ausspielen.`;
        setTimeout(() => { showToast(`💣 Bombe! Stich verfällt.`); }, 50);
      } else {
        room.message = `${playerName(room, winnerId)} gewinnt den Stich.`;
        setTimeout(() => { showToast(`${playerName(room, winnerId)} gewinnt den Stich`); }, 50);
      }
      return room;
    }

    room.turnIndex = (room.turnIndex + 1) % order.length;
    room.message = `${playerName(room, order[room.turnIndex])} ist am Zug.`;
    return room;
  });
}

async function nextRound() {
  if (!roomCache || roomCache.hostId !== currentPlayerId) return;
  if (roomCache.phase !== "finished" && roomCache.phase !== "round_summary") return;
  
  const roomReference = ref(db, `rooms/${currentRoomCode}`);
  await runTransaction(roomReference, room => {
    if (!room) return room;
    
    if (room.phase === "finished") {
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
      room.scoreHistory = [];
      room.trumpCard = null;
      room.trumpSuit = null;
      room.trickReadyToClear = false;
      room.pendingTrumpChoiceSeat = null;
      room.winnerId = null;
      room.message = "Neue Partie bereit.";
      return room;
    }
    
    if (room.phase === "round_summary") {
      const next = buildRoundState(room, room.roundNo + 1);
      Object.assign(room, next);
      return room;
    }
    
    return room;
  });
}

function maybeScheduleBot(state) {
  if (!state) return;
  if (state.phase === "round_summary" || state.phase === "finished" || state.roundNo === 0) return;
  if (state.trickReadyToClear) return; 

  const order = playerIds(state);
  
  let botId = currentTurnPlayerId(state);
  if (state.phase === "choose_trump" && state.pendingTrumpChoiceSeat !== null && state.pendingTrumpChoiceSeat !== undefined) {
    botId = order[state.pendingTrumpChoiceSeat];
  }

  if (!botId || !isBot(state, botId)) return;

  window.setTimeout(async () => {
    const fresh = roomCache;
    if (!fresh || fresh.phase === "round_summary" || fresh.phase === "finished" || fresh.roundNo === 0) return;
    if (fresh.trickReadyToClear) return;
    
    let currentBotId = currentTurnPlayerId(fresh);
    if (fresh.phase === "choose_trump" && fresh.pendingTrumpChoiceSeat !== null && fresh.pendingTrumpChoiceSeat !== undefined) {
      currentBotId = fresh.order ? fresh.order[fresh.pendingTrumpChoiceSeat] : order[fresh.pendingTrumpChoiceSeat];
    }
    
    if (!currentBotId || !isBot(fresh, currentBotId) || currentBotId !== botId) return;

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
        
        const finalChoice = allowed.includes(choice) ? choice : allowed[0];
        
        if (!room.bids) room.bids = {};
        room.bids[currentBotId] = finalChoice;
        
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
            const hasBomb = room.currentTrick.some(p => p.card.kind === "bomb");
            
            if (!hasBomb) {
              room.tricksTaken[winnerId] = (room.tricksTaken[winnerId] || 0) + 1;
            }
            room.trickCount = (room.trickCount || 0) + 1;
            
            room.trickReadyToClear = true;
            room.trickWinner = winnerId;

            if (hasBomb) {
              room.message = `💣 BUMM! Stich zerstört. ${playerName(room, winnerId)} darf ausspielen.`;
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
  }, 600 + Math.random() * 400);
}

function maybeFillLocalRoomCode() {
  const saved = localStorage.getItem(LOCAL.roomCode);
  if (saved) els.roomInput.value = saved;
  if (currentName) els.nameInput.value = currentName;
}

els.bidMinusBtn.addEventListener("click", () => {
  if (currentSelectedBid > 0) {
    currentSelectedBid--;
    updateBidDisplay();
  }
});

els.bidPlusBtn.addEventListener("click", () => {
  const maxBidsAllowed = roomCache ? roundSize(roomCache) : 20;
  if (currentSelectedBid < maxBidsAllowed) {
    currentSelectedBid++;
    updateBidDisplay();
  }
});

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

els.settingsBtn?.addEventListener("click", () => {
  els.settingsOverlay?.classList.remove("hidden");
});
els.closeSettingsBtn?.addEventListener("click", () => {
  els.settingsOverlay?.classList.add("hidden");
});

els.closeStatsBtn?.addEventListener("click", () => {
  els.statsOverlay?.classList.add("hidden");
});

els.anniversaryCheck?.addEventListener("change", async () => {
  if (!roomCache || roomCache.hostId !== currentPlayerId) return;
  await update(ref(db, `rooms/${currentRoomCode}`), {
    anniversaryMode: els.anniversaryCheck.checked
  });
});

els.strictBidCheck?.addEventListener("change", async () => {
  if (!roomCache || roomCache.hostId !== currentPlayerId) return;
  await update(ref(db, `rooms/${currentRoomCode}`), {
    strictBidRule: els.strictBidCheck.checked
  });
});

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
} else {
  fetchGlobalLeaderboard();
}

window.addEventListener("beforeunload", () => {
  if (currentRoomCode) localStorage.setItem(LOCAL.roomCode, currentRoomCode);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement === els.nameInput || e.key === "Enter" && document.activeElement === els.roomInput) {
    if (els.gameView.classList.contains("hidden")) joinOrCreateRoom(false);
  }
});
