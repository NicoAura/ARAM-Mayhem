// ARAM Mayhem stats dashboard. Reads a match archive entirely in the browser.
"use strict";

// Queue and map names, filled in from constants.json; these cover a page without it.
const QUEUE_NAMES = { 2400: "ARAM Mayhem", 2450: "ARAM Mayhem (2450)", 450: "ARAM" };
const MAP_NAMES = { 12: "Howling Abyss" };

const state = {
  games: [],        // normalized rows for the archive owner, one per game
  champNames: {},   // championId -> name
  augNames: {},     // augmentId -> name
  augRarity: {},    // augmentId -> kSilver | kGold | kPrismatic
  owner: null,
  sample: false,
  boots: new Set(), // item ids that count as boots
  champAlias: {},   // championId -> alias as in /champions/<alias>
  live: [],         // game recordings from the helper, newest first
  owned: null,      // {champions: [ids], skins: [ids]} from the client, when synced
};

// A page can ship name tables and an example archive ahead of time.
const PRESET = window.MAYHEM_PRESET || {};
try { if (window.self !== window.top && !PRESET.sample) document.documentElement.classList.add("embedded"); } catch (e) { document.documentElement.classList.add("embedded"); }
Object.assign(state.champNames, PRESET.champNames || {});
Object.assign(state.augNames, PRESET.augNames || {});
Object.assign(state.augRarity, PRESET.augRarity || {});

// ---------- loading ----------

const $ = (id) => document.getElementById(id);

function showError(msg) {
  const el = $("load-error");
  el.textContent = msg;
  el.hidden = false;
  $("loader").hidden = false;
}

async function loadText(text, { sample = false } = {}) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return showError("Your saved games couldn't be read."); }
  const raw = findGames(data);
  if (!raw.length) return showError("No Mayhem games yet. Import games from client to add them.");
  const owner = findOwner(data, raw);
  state.owner = owner;
  state.owned = data && data.owned && Array.isArray(data.owned.champions) ? data.owned : null;
  state.games = raw.map((g) => normalize(g, owner)).filter(Boolean)
    .sort((a, b) => b.time - a.time);
  if (!state.games.length) return showError("Couldn't find the account's own stats in those games.");
  state.sample = sample;
  $("load-error").hidden = true;
  $("loader").hidden = true;
  $("stats").hidden = false;
  $("actions").hidden = false;
  $("sample-note").hidden = !sample;
  setupFilters();
  render();
  Promise.all([loadNames(), loadItems()]).then(() => { render(); setupBanner(); linkRecentlyPlayed(); });
}

function findGames(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["games", "matches", "data"]) {
    const v = data[k];
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.games)) return v.games;
  }
  return [];
}

// The owner is the account the archive belongs to: an explicit field if the
// file has one, otherwise whoever appears in the most games.
function findOwner(data, games) {
  if (!Array.isArray(data)) {
    const p = data.puuid || data.accountPuuid || (data.account && data.account.puuid) || (data.summoner && data.summoner.puuid);
    if (p) return p;
  }
  const counts = {};
  for (const g of games) for (const p of players(g)) if (p.puuid) counts[p.puuid] = (counts[p.puuid] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// Returns [{puuid, name, participant}] for both archive formats.
function players(g) {
  const info = g.info || g;
  const parts = info.participants || [];
  if (info.participantIdentities) {
    const byId = {};
    for (const pi of info.participantIdentities) byId[pi.participantId] = pi.player || {};
    return parts.map((p) => {
      const pl = byId[p.participantId] || {};
      return { puuid: pl.puuid, name: pl.gameName ? `${pl.gameName}#${pl.tagLine || ""}` : pl.summonerName, participant: p };
    });
  }
  return parts.map((p) => ({ puuid: p.puuid, name: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline || ""}` : p.summonerName, participant: p }));
}

function normalize(g, owner) {
  const info = g.info || g;
  const me = players(g).find((p) => p.puuid === owner);
  if (!me) return null;
  const p = me.participant;
  const s = p.stats || p;
  const augs = [1, 2, 3, 4, 5, 6].map((i) => s["playerAugment" + i]).filter((a) => a && a > 0);
  let time = info.gameCreation || Date.parse(info.gameCreationDate || "") || 0;
  // gameDuration is seconds in newer archives, milliseconds in older ones
  let dur = info.gameDuration || 0;
  if (dur > 20000) dur = Math.round(dur / 1000);
  return {
    id: info.gameId || (g.metadata && g.metadata.matchId),
    time,
    queue: info.queueId,
    patch: (info.gameVersion || "").split(".").slice(0, 2).join("."),
    duration: dur,
    champId: p.championId,
    champNameRaw: p.championName,
    win: !!s.win,
    kills: s.kills || 0,
    deaths: s.deaths || 0,
    assists: s.assists || 0,
    damage: s.totalDamageDealtToChampions || 0,
    augs,
    name: me.name,
    // [seconds, x, y, killerId, victimId] per kill; undefined until synced
    killMap: g.killMap,
    pid: p.participantId,
    penta: s.pentaKills || 0,
    quadra: s.quadraKills || 0,
    spree: s.largestKillingSpree || 0,
    heal: s.totalHeal || 0,
    taken: s.totalDamageTaken || 0,
    items: [0, 1, 2, 3, 4, 5, 6].map((i) => s["item" + i]).filter((x) => x > 0),
  };
}

// Champion and augment names; if unavailable the page falls back to ids.
async function loadItems() {
  try {
    const items = await (await fetch("/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json")).json();
    for (const it of items) if ((it.categories || []).includes("Boots") && !(it.id >= 550000 && it.id < 560000)) state.boots.add(it.id);
  } catch (e) { console.warn("item data unavailable", e); }
}

async function loadNames() {
  try {
    const c = await (await fetch("constants.json")).json();
    for (const [id, name] of Object.entries(c.queues || {})) if (!QUEUE_NAMES[id]) QUEUE_NAMES[id] = name;
    Object.assign(MAP_NAMES, c.maps || {});
  } catch (e) { console.warn("queue names unavailable", e); }
  try {
    const champs = await (await fetch("/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json")).json();
    for (const c of champs) if (c.id > 0) { state.champNames[c.id] = c.name; state.champAlias[c.id] = c.alias; }
  } catch (e) { console.warn("champion names unavailable", e); }
  for (const url of [
    "/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
    "/assets/cd/latest/cdragon/arena/en_us.json",
  ]) {
    try {
      const j = await (await fetch(url)).json();
      const list = Array.isArray(j) ? j : (j.augments || []);
      for (const a of list) {
        const name = a.nameTRA || a.name;
        if (a.id != null && name && !state.augNames[a.id]) state.augNames[a.id] = name;
        if (a.id != null && a.rarity && !state.augRarity[a.id]) state.augRarity[a.id] = a.rarity;
      }
    } catch (e) { console.warn("augment names unavailable from", url, e); }
  }
}

const champName = (g) => state.champNames[g.champId] || g.champNameRaw || `Champion ${g.champId}`;
const augName = (id) => state.augNames[id] || `Augment ${id}`;
const RARITY = { kSilver: ["Silver", 1], kGold: ["Gold", 2], kPrismatic: ["Prismatic", 3] };

// ---------- filters ----------

let filtersReady = false;
// Patches newest first; views default to the newest one in the archive.
const patchKey = (p) => p.split(".").map((n) => n.padStart(4, "0")).join(".");
let latestPatch = "";

function setupFilters() {
  const patches = [...new Set(state.games.map((g) => g.patch).filter(Boolean))].sort((a, b) => patchKey(b).localeCompare(patchKey(a)));
  latestPatch = patches[0] || "";
  $("f-patch").innerHTML = '<option value="">All patches</option>' +
    patches.map((p) => `<option value="${p}">Patch ${p}</option>`).join("");
  $("f-patch").value = latestPatch;
  const queues = [...new Set(state.games.map((g) => g.queue))].sort();
  const sel = $("f-queue");
  sel.innerHTML = '<option value="">All</option>' +
    queues.map((q) => `<option value="${q}">${QUEUE_NAMES[q] || "Queue " + q}</option>`).join("");
  const name = state.games.find((g) => g.name)?.name;
  const first = new Date(state.games[state.games.length - 1].time);
  const last = new Date(state.games[0].time);
  $("account").hidden = false;
  $("account").textContent = `${name ? name + " · " : ""}${state.games.length} games, ${fmtDate(first)} to ${fmtDate(last)}`;
  if (filtersReady) return;
  filtersReady = true;
  for (const id of ["f-patch", "f-queue", "f-from", "f-to", "f-champ", "f-minaug", "f-minpair"]) $(id).addEventListener("input", render);
  $("f-reset").addEventListener("click", () => {
    for (const id of ["f-queue", "f-from", "f-to", "f-champ"]) $(id).value = "";
    $("f-patch").value = latestPatch;
    render();
  });
}

function filtered() {
  const patch = $("f-patch").value;
  const q = $("f-queue").value;
  const from = $("f-from").value ? Date.parse($("f-from").value) : -Infinity;
  const to = $("f-to").value ? Date.parse($("f-to").value) + 86400000 : Infinity;
  const champ = $("f-champ").value.trim().toLowerCase();
  return state.games.filter((g) =>
    (!patch || g.patch === patch) && (!q || String(g.queue) === q) && g.time >= from && g.time < to &&
    (!champ || champName(g).toLowerCase().includes(champ)));
}

// ---------- rendering ----------

const pct = (n) => (n * 100).toFixed(1) + "%";
const fmtDate = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const kda = (k, d, a) => ((k + a) / Math.max(1, d)).toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function render() {
  const games = filtered();
  renderTiles(games);
  renderBadges(state.games);
  renderChart(games);
  renderKillMap(games);
  renderChamps(games);
  renderAugs(games);
  renderLength(games);
  renderBoots(games);
  renderRecords(state.games);
  renderCurve(state.games);
  renderPairs(games);
  renderGames(games);
  if (state.live.length) renderLive();
}

function sum(games, f) { return games.reduce((t, g) => t + f(g), 0); }

function renderTiles(games) {
  const n = games.length;
  const wins = sum(games, (g) => g.win);
  const K = sum(games, (g) => g.kills), D = sum(games, (g) => g.deaths), A = sum(games, (g) => g.assists);
  const dmg = n ? sum(games, (g) => g.damage) / n : 0;
  const dur = n ? sum(games, (g) => g.duration) / n : 0;
  const tiles = [
    ["Total matches", n.toLocaleString(), `${wins} W · ${n - wins} L${n < state.games.length ? ` · of ${state.games.length.toLocaleString()}` : ""}`],
    ["Win rate", n ? pct(wins / n) : "–", "", n ? wrClass(wins / n) : ""],
    ["KDA", n ? kda(K, D, A) : "–", n ? `${(K / n).toFixed(1)} / ${(D / n).toFixed(1)} / ${(A / n).toFixed(1)}` : ""],
    ["Damage to champions", n ? Math.round(dmg).toLocaleString() : "–", "per game"],
    ["Game length", n ? `${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}` : "–", "average"],
    ["Champions played", new Set(games.map((g) => g.champId)).size, ""],
  ];
  $("tiles").innerHTML = tiles.map(([l, v, s, c]) =>
    `<div class="tile ${c || ""}"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("");
}

// Achievements count every imported game, whatever the filters show.
const BADGES = [
  ["Pentakill", "Get a pentakill", (G) => count(G, (g) => g.penta > 0), 1],
  ["Quadra", "Get a quadra kill", (G) => count(G, (g) => g.quadra + g.penta > 0), 1],
  ["Legendary", "Kill 8 champions without dying", (G) => max(G, (g) => g.spree), 8],
  ["Massacre", "Get 25 kills in one game", (G) => max(G, (g) => g.kills), 25],
  ["Helping hand", "Get 40 assists in one game", (G) => max(G, (g) => g.assists), 40],
  ["Untouchable", "Win a game without dying", (G) => count(G, (g) => g.win && g.deaths === 0), 1],
  ["Heavy hitter", "Deal 75,000 damage to champions in one game", (G) => max(G, (g) => g.damage), 75000],
  ["Frontline", "Take 80,000 damage in one game", (G) => max(G, (g) => g.taken), 80000],
  ["Speedrun", "Win a game in under 15 minutes", (G) => count(G, (g) => g.win && g.duration > 0 && g.duration < 900), 1],
  ["Marathon", "Play a game over 30 minutes", (G) => count(G, (g) => g.duration >= 1800), 1],
  ["Hot streak", "Win 5 games in a row", (G) => streak(G), 5],
  ["Unstoppable", "Win 10 games in a row", (G) => streak(G), 10],
  ["Main", "Win 10 games on one champion", (G) => bestChamp(G, true), 10],
  ["One-trick", "Play 50 games on one champion", (G) => bestChamp(G, false), 50],
  ["Explorer", "Play 50 different champions", (G) => new Set(G.map((g) => g.champId)).size, 50],
  ["Collector", "Pick 100 different augments", (G) => new Set(G.flatMap((g) => g.augs)).size, 100],
  ["Regular", "Play 100 games", (G) => G.length, 100],
  ["Veteran", "Play 500 games", (G) => G.length, 500],
  ["Winner", "Win 250 games", (G) => count(G, (g) => g.win), 250],
];

function count(G, f) { return G.reduce((t, g) => t + (f(g) ? 1 : 0), 0); }
function max(G, f) { return G.reduce((m, g) => Math.max(m, f(g)), 0); }
function streak(G) {
  let best = 0, run = 0;
  for (const g of [...G].sort((a, b) => a.time - b.time)) { run = g.win ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
function bestChamp(G, wins) {
  const m = new Map();
  for (const g of G) if (!wins || g.win) m.set(g.champId, (m.get(g.champId) || 0) + 1);
  return Math.max(0, ...m.values());
}

const badgeRows = (G) => BADGES.map(([name, desc, f, goal]) => ({ name, desc, goal, have: f(G) }));

function renderBadges(G) {
  const rows = badgeRows(G);
  const earned = rows.filter((r) => r.have >= r.goal).length;
  $("n-badges").textContent = `${earned} of ${rows.length} earned`;
  rows.sort((a, b) => (b.have >= b.goal) - (a.have >= a.goal) || b.have / b.goal - a.have / a.goal);
  $("badges").innerHTML = rows.map((r) => {
    const done = r.have >= r.goal;
    const prog = Math.min(1, r.have / r.goal);
    const label = r.goal === 1 ? (done ? `${r.have.toLocaleString()}×` : "Not yet") : `${Math.min(r.have, r.goal).toLocaleString()} / ${r.goal.toLocaleString()}`;
    return `<div class="badge${done ? " done" : ""}" title="${esc(r.desc)}">
      <div class="b-name">${done ? "★ " : ""}${esc(r.name)}</div>
      <div class="b-desc">${esc(r.desc)}</div>
      <div class="b-bar"><span style="width:${(prog * 100).toFixed(1)}%"></span></div>
      <div class="b-prog">${label}</div></div>`;
  }).join("");
}

function renderChart(games) {
  const months = new Map();
  for (const g of [...games].reverse()) {
    const d = new Date(g.time);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.get(key) || { key, n: 0, w: 0 };
    m.n++; m.w += g.win;
    months.set(key, m);
  }
  const rows = [...months.values()];
  const el = $("chart");
  if (!rows.length) { el.innerHTML = '<p class="muted">No games match.</p>'; return; }
  const W = 960, H = 260, L = 40, R = 8, T = 10, B = 28;
  const pw = (W - L - R) / rows.length;
  const bw = Math.max(2, Math.min(40, pw - 2));
  const y = (v) => T + (1 - v) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win rate by month">`;
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg += `<line class="${v === 0.5 ? "ref" : "grid"}" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
  }
  const every = Math.ceil(rows.length / 12);
  rows.forEach((m, i) => {
    const x = L + i * pw + (pw - bw) / 2;
    const r = m.w / m.n;
    const top = y(r), base = y(0);
    const h = Math.max(0, base - top);
    const rad = Math.min(4, bw / 2, h);
    // bar with rounded top, square at the baseline
    svg += `<path class="bar" data-i="${i}" d="M${x},${base} V${top + rad} Q${x},${top} ${x + rad},${top} H${x + bw - rad} Q${x + bw},${top} ${x + bw},${top + rad} V${base} Z"/>`;
    // invisible full-height hit target
    svg += `<rect data-i="${i}" x="${L + i * pw}" y="${T}" width="${pw}" height="${H - T - B}" fill="transparent"/>`;
    if (i % every === 0) svg += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${m.key}</text>`;
  });
  el.innerHTML = svg + "</svg>";
  const tip = $("tooltip");
  el.querySelectorAll("[data-i]").forEach((node) => {
    node.addEventListener("mousemove", (e) => {
      const m = rows[node.dataset.i];
      tip.innerHTML = `<strong>${m.key}</strong><br>${pct(m.w / m.n)} win rate<br>${m.w}W ${m.n - m.w}L`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 12, innerWidth - 160) + "px";
      tip.style.top = e.clientY + 12 + "px";
      el.querySelectorAll(".bar").forEach((b) => b.classList.toggle("hot", b.dataset.i === node.dataset.i));
    });
    node.addEventListener("mouseleave", () => {
      tip.hidden = true;
      el.querySelectorAll(".bar.hot").forEach((b) => b.classList.remove("hot"));
    });
  });
}

// ---------- kill map ----------
// Positions are game units on the Howling Abyss; the minimap spans this square.
const MAP12 = { minX: -28, minY: -19, maxX: 12849, maxY: 12858 };
const MINIMAP_BASE = "/assets/cd/latest/game/assets/maps/info/map12/";
const KM_GRID = 128;
let kmMode = "kills";

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// Smooths points into a KM_GRID square grid with a small Gaussian kernel.
function density(points) {
  const grid = new Float32Array(KM_GRID * KM_GRID);
  const R = 3, sigma2 = 2 * 1.6 * 1.6;
  for (const [gx, gy] of points) {
    const cx = Math.round(gx), cy = Math.round(gy);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= KM_GRID || y >= KM_GRID) continue;
      grid[y * KM_GRID + x] += Math.exp(-(dx * dx + dy * dy) / sigma2);
    }
  }
  return grid;
}

function renderKillMap(games) {
  const kills = [], deaths = [];
  let mapped = 0, missing = 0;
  for (const g of games) {
    if (!Array.isArray(g.killMap)) { missing++; continue; }
    mapped++;
    for (const [, x, y, killer, victim] of g.killMap) {
      const gx = (x - MAP12.minX) / (MAP12.maxX - MAP12.minX) * KM_GRID;
      const gy = (1 - (y - MAP12.minY) / (MAP12.maxY - MAP12.minY)) * KM_GRID;
      if (killer === g.pid) kills.push([gx, gy]);
      if (victim === g.pid) deaths.push([gx, gy]);
    }
  }
  const img = $("km-img");
  const src = MINIMAP_BASE + $("km-skin").value + ".png";
  if (img.getAttribute("src") !== src) img.src = src;

  const layers = [];
  if (kmMode !== "deaths") layers.push({ pts: kills, rgb: hexRgb(cssVar("--good")) });
  if (kmMode !== "kills") layers.push({ pts: deaths, rgb: hexRgb(cssVar("--bad")) });
  const canvas = $("km-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const off = document.createElement("canvas");
  off.width = off.height = KM_GRID;
  const octx = off.getContext("2d");
  for (const { pts, rgb } of layers) {
    if (!pts.length) continue;
    const grid = density(pts);
    let max = 0;
    for (const v of grid) if (v > max) max = v;
    const im = octx.createImageData(KM_GRID, KM_GRID);
    for (let i = 0; i < grid.length; i++) {
      const v = Math.sqrt(grid[i] / max); // sqrt keeps lighter spots visible next to the hottest one
      im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2];
      im.data[i * 4 + 3] = v < 0.08 ? 0 : Math.round(40 + v * 200);
    }
    octx.putImageData(im, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  $("km-legend").innerHTML =
    `<div class="km-key"><i style="background:var(--good)"></i>Kills<b>${kills.length.toLocaleString()}</b></div>` +
    `<div class="km-key"><i style="background:var(--bad)"></i>Deaths<b>${deaths.length.toLocaleString()}</b></div>`;
  let note = `From ${mapped.toLocaleString()} of ${games.length.toLocaleString()} games.`;
  if (missing) note += " The rest have no positions yet: importing adds them, up to 200 games per import. Very old games may not have one.";
  note += " The map skin isn't recorded, so pick one above.";
  $("km-note").textContent = note;
}

document.querySelectorAll("[data-km]").forEach((b) => b.addEventListener("click", () => {
  kmMode = b.dataset.km;
  document.querySelectorAll("[data-km]").forEach((o) => o.classList.toggle("on", o === b));
  render();
}));
$("km-skin").addEventListener("input", render);

// Sortable table helper. cols: [{label, get, fmt?}]
const sortState = {};
const wrClass = (wr) => (wr >= 0.52 ? "wr-high" : wr <= 0.48 ? "wr-low" : "");

function table(id, cols, rows, defaultSort) {
  const t = $(id);
  const s = sortState[id] || (sortState[id] = { col: defaultSort, asc: false });
  const col = cols[s.col];
  rows.sort((a, b) => {
    const va = col.get(a), vb = col.get(b);
    const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return s.asc ? c : -c;
  });
  t.innerHTML = "<thead><tr>" + cols.map((c, i) =>
    `<th data-c="${i}" class="${i === s.col ? "sorted" + (s.asc ? " asc" : "") : ""}">${c.label}</th>`).join("") +
    "</tr></thead><tbody>" + rows.map((r) => "<tr>" + cols.map((c) =>
      `<td${c.cls ? ` class="${c.cls(r)}"` : ""}>${c.fmt ? c.fmt(r) : esc(c.get(r))}</td>`).join("") + "</tr>").join("") + "</tbody>";
  t.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
    const c = +th.dataset.c;
    if (s.col === c) s.asc = !s.asc; else { s.col = c; s.asc = false; }
    render();
  }));
}

function group(games, keyFn) {
  const map = new Map();
  for (const g of games) for (const k of [].concat(keyFn(g))) {
    const r = map.get(k) || { key: k, n: 0, w: 0, k: 0, d: 0, a: 0, dmg: 0, sample: g };
    r.n++; r.w += g.win; r.k += g.kills; r.d += g.deaths; r.a += g.assists; r.dmg += g.damage;
    map.set(k, r);
  }
  return [...map.values()];
}

function renderChamps(games) {
  const rows = group(games, (g) => g.champId);
  $("n-champs").textContent = `${games.length.toLocaleString()} matches`;
  table("t-champs", [
    { label: "Champion", get: (r) => champName(r.sample) },
    { label: "Matches", get: (r) => r.n },
    { label: "Win rate", get: (r) => r.w / r.n, fmt: (r) => pct(r.w / r.n), cls: (r) => wrClass(r.w / r.n) },
    { label: "KDA", get: (r) => (r.k + r.a) / Math.max(1, r.d), fmt: (r) => kda(r.k, r.d, r.a) },
    { label: "Damage", get: (r) => r.dmg / r.n, fmt: (r) => Math.round(r.dmg / r.n).toLocaleString() },
  ], rows, 1);
}

function renderAugs(games) {
  const min = +$("f-minaug").value || 1;
  const total = games.length || 1;
  const rows = group(games, (g) => g.augs).filter((r) => r.n >= min);
  table("t-augs", [
    { label: "Augment", get: (r) => augName(r.key), fmt: (r) => esc(augName(r.key)) },
    { label: "Tier", get: (r) => (RARITY[state.augRarity[r.key]] || ["", 0])[1],
      fmt: (r) => { const t = RARITY[state.augRarity[r.key]]; return t ? `<span class="tier ${state.augRarity[r.key]}">${t[0]}</span>` : ""; } },
    { label: "Picks", get: (r) => r.n },
    { label: "Pick rate", get: (r) => r.n / total, fmt: (r) => pct(r.n / total) },
    { label: "Win rate", get: (r) => r.w / r.n, fmt: (r) => pct(r.w / r.n), cls: (r) => wrClass(r.w / r.n) },
  ], rows, 2);
}

// ---------- game length, boots, records, learning curve, augment pairs ----------

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// Rows of {label, n, w} drawn as win-rate bars; the dashed line marks 50%.
function wrBars(id, rows) {
  const shown = rows.filter((r) => r.n);
  $(id).innerHTML = shown.length ? shown.map((r) => {
    const rate = r.w / r.n;
    return `<div class="wrbar"><span class="wb-label">${esc(r.label)}</span>
      <span class="wb-track"><span class="wb-fill ${wrClass(rate)}" style="width:${(rate * 100).toFixed(1)}%"></span></span>
      <span class="wb-v ${wrClass(rate)}">${pct(rate)}</span><span class="wb-n">${r.n.toLocaleString()}</span></div>`;
  }).join("") : `<p class="foot">No games in this view.</p>`;
}

const LENGTHS = [[0, 900, "Under 15 min"], [900, 1080, "15–18 min"], [1080, 1260, "18–21 min"], [1260, 1440, "21–24 min"], [1440, 1e9, "24 min or more"]];

function renderLength(games) {
  const timed = games.filter((g) => g.duration > 0);
  $("n-length").textContent = timed.length ? `Average ${mmss(sum(timed, (g) => g.duration) / timed.length)}` : "";
  wrBars("wr-length", LENGTHS.map(([lo, hi, label]) => {
    const G = timed.filter((g) => g.duration >= lo && g.duration < hi);
    return { label, n: G.length, w: count(G, (g) => g.win) };
  }));
}

function renderBoots(games) {
  if (!state.boots.size) return wrBars("wr-boots", []);
  const G = games.filter((g) => g.items && g.items.length);
  const has = (g) => g.items.some((i) => state.boots.has(i));
  wrBars("wr-boots", [
    { label: "With boots", n: count(G, has), w: count(G, (g) => g.win && has(g)) },
    { label: "No boots", n: count(G, (g) => !has(g)), w: count(G, (g) => g.win && !has(g)) },
  ]);
}

const RECORDS = [
  ["Most kills", (g) => g.kills, (v) => v],
  ["Most assists", (g) => g.assists, (v) => v],
  ["Most deaths", (g) => g.deaths, (v) => v],
  ["Most damage", (g) => g.damage, (v) => v.toLocaleString()],
  ["Most damage taken", (g) => g.taken, (v) => v.toLocaleString()],
  ["Most healing", (g) => g.heal, (v) => v.toLocaleString()],
  ["Longest killing spree", (g) => g.spree, (v) => v],
  ["Best KDA", (g) => (g.kills + g.assists) / Math.max(1, g.deaths), (v) => v.toFixed(2)],
  ["Longest game", (g) => g.duration, mmss],
  ["Fastest win", (g) => (g.win && g.duration > 0 ? -g.duration : -Infinity), (v) => mmss(-v)],
];

function renderRecords(G) {
  $("records").innerHTML = RECORDS.map(([label, f, fmt]) => {
    let best = null, bv = -Infinity;
    for (const g of G) { const v = f(g); if (v > bv) { bv = v; best = g; } }
    if (!best || !Number.isFinite(bv) || bv <= 0 && !label.startsWith("Fastest")) return "";
    return `<div class="record"><div class="r-v">${fmt(bv)}</div><div class="r-label">${label}</div>
      <div class="r-sub">${esc(champName(best))} · ${fmtDate(new Date(best.time))}</div></div>`;
  }).join("");
}

const CURVE = [[1, 5, "Games 1–5"], [6, 10, "6–10"], [11, 20, "11–20"], [21, 1e9, "21+"]];

function renderCurve(G) {
  const byChamp = new Map();
  for (const g of [...G].sort((a, b) => a.time - b.time)) {
    const list = byChamp.get(g.champId) || [];
    list.push(g);
    byChamp.set(g.champId, list);
  }
  const rows = [...byChamp.values()].filter((l) => l.length >= 10).map((l) => {
    const r = { sample: l[0], n: l.length, b: CURVE.map(([lo, hi]) => l.slice(lo - 1, hi)) };
    const first = r.b[0], last = r.b.filter((x) => x.length).at(-1);
    r.change = count(last, (g) => g.win) / last.length - count(first, (g) => g.win) / first.length;
    return r;
  });
  const cell = (i) => ({
    label: CURVE[i][2], get: (r) => (r.b[i].length ? count(r.b[i], (g) => g.win) / r.b[i].length : -1),
    fmt: (r) => (r.b[i].length ? pct(count(r.b[i], (g) => g.win) / r.b[i].length) : "–"),
    cls: (r) => (r.b[i].length >= 3 ? wrClass(count(r.b[i], (g) => g.win) / r.b[i].length) : ""),
  });
  table("t-curve", [
    { label: "Champion", get: (r) => champName(r.sample), fmt: (r) => esc(champName(r.sample)) },
    { label: "Matches", get: (r) => r.n },
    cell(0), cell(1), cell(2), cell(3),
    { label: "Change", get: (r) => r.change, fmt: (r) => `${r.change > 0 ? "+" : ""}${(r.change * 100).toFixed(1)}`,
      cls: (r) => (r.change > 0 ? "delta-up" : r.change < 0 ? "delta-down" : "") },
  ], rows, 1);
}

function renderPairs(games) {
  const min = +$("f-minpair").value || 1;
  const map = new Map();
  for (const g of games) {
    const a = [...new Set(g.augs)].sort((x, y) => x - y);
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const k = a[i] + "-" + a[j];
      const r = map.get(k) || { a: a[i], b: a[j], n: 0, w: 0 };
      r.n++; r.w += g.win ? 1 : 0;
      map.set(k, r);
    }
  }
  // The 100 best pairs; ties go to the pair seen in more games
  const rows = [...map.values()].filter((r) => r.n >= min).sort((x, y) => y.w / y.n - x.w / x.n || y.n - x.n).slice(0, 100);
  table("t-pairs", [
    { label: "Augments", get: (r) => augName(r.a) + augName(r.b), fmt: (r) => `${esc(augName(r.a))} + ${esc(augName(r.b))}` },
    { label: "Games", get: (r) => r.n },
    { label: "Win rate", get: (r) => r.w / r.n + r.n / 1e6, fmt: (r) => pct(r.w / r.n), cls: (r) => wrClass(r.w / r.n) },
  ], rows, 2);
}

function renderGames(games) {
  $("n-games").textContent = games.length > 200 ? `Latest 200 of ${games.length.toLocaleString()} matches` : `${games.length.toLocaleString()} matches`;
  table("t-games", [
    { label: "Date", get: (r) => r.time, fmt: (r) => fmtDate(new Date(r.time)) },
    { label: "Champion", get: (r) => champName(r), fmt: (r) => esc(champName(r)) },
    { label: "Result", get: (r) => +r.win, fmt: (r) => (r.win ? "Win" : "Loss"), cls: (r) => (r.win ? "win" : "loss") },
    { label: "K / D / A", get: (r) => (r.kills + r.assists) / Math.max(1, r.deaths), fmt: (r) => `${r.kills} / ${r.deaths} / ${r.assists}` },
    { label: "Damage", get: (r) => r.damage, fmt: (r) => r.damage.toLocaleString() },
    { label: "Length", get: (r) => r.duration, fmt: (r) => `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, "0")}` },
    { label: "Augments", get: (r) => r.augs.length, fmt: (r) => esc(r.augs.map(augName).join(", ")), cls: () => "augs" },
  ], games.slice(0, 200), 0);
}

// ---------- wiring ----------


// ---------- sync ----------
// Opened from the local sync helper, "Import games from client" adds games
// newer than the archive. Opened any other way, the button explains how.

const syncBtns = [...document.querySelectorAll(".sync-btn")];
const syncStatus = $("sync-status");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OFFLINE_HINT = "Connect to the Riot Client first: open it on this computer and sign in, then open this page from Open Mayhem Stats.command.";
let helperOnline = false;
// The helper serves this page at its root; the site's copy (under /embed/) has no helper behind it, so it
// never asks for the archive or the helper's endpoints.
const ON_HELPER = location.protocol !== "file:" && !location.pathname.startsWith("/embed/");

function setSyncStatus(text, error = false) {
  syncStatus.hidden = !text;
  syncStatus.textContent = text || "";
  syncStatus.classList.toggle("error", error);
}

async function syncState() {
  const res = await fetch("api/sync", { cache: "no-store" });
  if (!res.ok) throw new Error(`helper answered ${res.status}`);
  return res.json();
}

async function reloadArchive() {
  const res = await fetch("data/mayhem-backup.json", { cache: "no-store" });
  if (res.ok) await loadText(await res.text());
}

async function watchSync() {
  for (const b of syncBtns) { b.dataset.label ||= b.textContent; b.disabled = true; }
  try {
    let s = await syncState();
    while (s.running) {
      setSyncStatus(s.log.at(-1) || "Importing…");
      await sleep(1000);
      s = await syncState();
    }
    if (s.error) {
      setSyncStatus(s.error, true);
    } else if (s.result) {
      const { added, total, failed } = s.result;
      await reloadArchive();
      const summary = added
        ? `Added ${added} new game${added === 1 ? "" : "s"}. ${total} in your archive.`
        : `Up to date. ${total} games in your archive.`;
      setSyncStatus(summary + (failed ? ` ${failed} couldn't be fetched; import again to retry them.` : "")
        + ((s.result.notes || []).filter((n) => n.startsWith("Sharing")).map((n) => " " + n).join("")));
      if (s.result.shared !== undefined) showShare({ enabled: true, shared: s.result.shared });
    }
  } catch (e) {
    setSyncStatus("Lost contact with the sync helper. Is it still running?", true);
  } finally {
    for (const b of syncBtns) b.disabled = false;
  }
}

const startSync = async () => {
  if (!helperOnline) {
    if (!ON_HELPER) return setSyncStatus(OFFLINE_HINT);
    // the helper may have been started since the page loaded
    try { await syncState(); helperOnline = true; } catch (e) { return setSyncStatus(OFFLINE_HINT); }
  }
  setSyncStatus("Starting…");
  try {
    const res = await fetch("api/sync", { method: "POST", headers: { "X-Mayhem": "1" } });
    if (!res.ok && res.status !== 409) throw new Error(String(res.status));
  } catch (e) {
    return setSyncStatus("Couldn't reach the sync helper.", true);
  }
  watchSync();
};
for (const b of syncBtns) b.addEventListener("click", startSync);

async function setupSync() {
  // The empty state already explains Sync, so this only picks up a running sync
  if (PRESET.sample || !ON_HELPER) return;
  try {
    const s = await syncState();
    helperOnline = true;
    if (s.running) watchSync();
  } catch (e) { /* no helper; the button explains when pressed */ }
}

// Opened from the sync helper, load the archive it keeps.
(async () => {
  if (PRESET.sample) return loadText(JSON.stringify(PRESET.sample), { sample: true });
  if (ON_HELPER) {
    try {
      const res = await fetch("data/mayhem-backup.json", { cache: "no-store" });
      if (res.ok) await loadText(await res.text());
    } catch (e) { /* no archive yet */ }
  }
  await setupSync();
  setupProfile();
  setupShare();
  setupLive();
  setupLink();
})();

// ---------- public page ----------
// Off unless the player publishes. Only totals, top champions and earned achievements leave the computer.

const profileCard = $("profile-card");
const profileText = $("profile-text");
const profileLink = $("profile-link");
const profileBtns = { publish: $("profile-publish"), remove: $("profile-remove") };

function profileSummary(G) {
  const champs = new Map();
  for (const g of G) {
    const c = champs.get(g.champId) || { id: g.champId, n: 0, w: 0, k: 0, d: 0, a: 0 };
    c.n++; c.w += g.win ? 1 : 0; c.k += g.kills; c.d += g.deaths; c.a += g.assists;
    champs.set(g.champId, c);
  }
  const n = G.length;
  return {
    games: n, wins: sum(G, (g) => g.win),
    kills: sum(G, (g) => g.kills), deaths: sum(G, (g) => g.deaths), assists: sum(G, (g) => g.assists),
    damage: Math.round(sum(G, (g) => g.damage) / n), duration: Math.round(sum(G, (g) => g.duration) / n),
    first: Math.min(...G.map((g) => g.time)), last: Math.max(...G.map((g) => g.time)),
    champions: [...champs.values()].sort((a, b) => b.n - a.n).slice(0, 10),
    badges: badgeRows(G).filter((r) => r.have >= r.goal).map((r) => r.name),
  };
}

function showProfile(p) {
  const on = !!(p && p.published);
  profileText.textContent = on
    ? "Your public page is live. Update it after importing new games, or remove it any time."
    : "Off. Publish a public page with your totals, top champions and achievements. Your individual games stay on this computer.";
  profileLink.hidden = !on;
  if (on) { profileLink.href = p.url; profileLink.textContent = p.url.replace(/^https?:\/\//, ""); }
  profileBtns.publish.textContent = on ? "Update my page" : "Publish my page";
  profileBtns.remove.hidden = !on;
}

async function profileCall(action, data) {
  const res = await fetch("api/profile", {
    method: "POST", headers: { "X-Mayhem": "1", "Content-Type": "application/json" },
    body: JSON.stringify({ action, data }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}

async function profileAction(action) {
  if (action === "remove" && !confirm("Remove your public page? Anyone with the link will see it's gone.")) return;
  for (const b of Object.values(profileBtns)) b.disabled = true;
  try {
    showProfile(await profileCall(action, action === "publish" ? profileSummary(state.games) : undefined));
  } catch (e) {
    profileText.textContent = e.message;
  } finally {
    for (const b of Object.values(profileBtns)) b.disabled = false;
  }
}
profileBtns.publish.addEventListener("click", () => profileAction("publish"));
profileBtns.remove.addEventListener("click", () => profileAction("remove"));

async function setupProfile() {
  // Publishing goes through the helper, so the card only shows when it's running and there are games
  if (!helperOnline || state.sample || !(state.games || []).length) return;
  profileCard.hidden = false;
  showProfile(null);
  try { showProfile(await profileCall("status")); } catch (e) { /* stays "Off" until they try */ }
}

// ---------- connect account ----------
// Links the Riot account signed in to this computer to a deeparam.com account, using the one-time code the
// site's account page shows. The helper proves which Riot account it is; nothing else is sent.

const linkStatus = $("link-status");

$("link-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("link-code");
  const code = input.value.trim().toUpperCase();
  linkStatus.hidden = false;
  if (!/^[A-Z0-9]{8}$/.test(code)) { linkStatus.textContent = "Enter the 8-character code from your account page."; return; }
  const btn = e.submitter || $("link-form").querySelector("button");
  btn.disabled = true;
  linkStatus.textContent = "Connecting…";
  try {
    const res = await fetch("api/profile", {
      method: "POST", headers: { "X-Mayhem": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link", code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.linked) throw new Error(j.error || "Something went wrong. Try again.");
    linkStatus.textContent = `Connected ${j.riotId || "your Riot account"}. Reload your account page on deeparam.com to see it.`;
    input.value = "";
  } catch (err) {
    linkStatus.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

function setupLink() {
  if (helperOnline && !state.sample) $("link-card").hidden = false;
}

// ---------- sharing ----------
// Off unless the player ticks the box; the helper sends games without names or account ids.

const shareBox = $("share-on");

function showShare(st) {
  shareBox.checked = !!st.enabled;
  $("share-count").textContent = st.enabled && st.shared ? `${st.shared.toLocaleString()} games shared` : "";
}

async function shareCall(body) {
  const res = await fetch("api/share", {
    method: "POST", headers: { "X-Mayhem": "1", "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Something went wrong. Try again.");
  return j;
}

shareBox.addEventListener("change", async () => {
  const on = shareBox.checked;
  if (!on && !confirm("Stop sharing and remove the games you've shared?")) { shareBox.checked = true; return; }
  const note = $("share-status");
  shareBox.disabled = true;
  note.hidden = false;
  note.textContent = on ? "Sharing your games…" : "Removing your shared games…";
  try {
    showShare(await shareCall({ enabled: on }));
    note.textContent = on ? "Sharing is on. New games are shared after each import." : "Sharing is off and your shared games were removed.";
  } catch (e) {
    shareBox.checked = !on;
    note.textContent = e.message;
  } finally {
    shareBox.disabled = false;
  }
});

async function setupShare() {
  if (!helperOnline || state.sample || !(state.games || []).length) return;
  $("share-card").hidden = false;
  try { showShare(await shareCall()); } catch (e) { /* stays off */ }
}

// ---------- recently played ----------
// Opened from the helper, a link carries the latest games to deeparam.com in the address's #part, which
// browsers never send anywhere; the site keeps them in this browser only. With them go the most-played
// champions, the champions this account owns and the chosen banner, for the site's own pages.
function mostPlayed(n) {
  const counts = new Map();
  for (const g of state.games) if (state.champAlias[g.champId]) counts.set(g.champId, (counts.get(g.champId) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => state.champAlias[id]);
}

function linkRecentlyPlayed() {
  const link = $("to-site");
  if (state.sample || !["127.0.0.1", "localhost"].includes(location.hostname)) return;
  const played = state.games.filter((g) => state.champAlias[g.champId]).slice(0, 12)
    .map((g) => ({ champion: state.champAlias[g.champId], win: g.win, at: g.time + g.duration * 1000 }));
  const payload = { played, top: mostPlayed(10) };
  if (state.owned) payload.owned = state.owned.champions.map((id) => state.champAlias[id]).filter(Boolean);
  const banner = savedBanner();
  if (banner) payload.banner = banner;
  link.hidden = !played.length;
  link.href = "https://deeparam.com/embed/dashboard/played.html#" + encodeURIComponent(JSON.stringify(payload));
}

// ---------- banner ----------
// A splash art behind the page header: the player's pick of champion and skin (skins they own, when the
// client sync has said which), or their most-played champion's default art.

const BANNER_KEY = "mayhem-banner";
const splashUrl = (b) => (b.num ? `/assets/splash/${b.champion}_${b.num}.jpg` : `/assets/dd/img/champion/splash/${b.champion}_0.jpg`);

function savedBanner() {
  try {
    const b = JSON.parse(localStorage.getItem(BANNER_KEY) || "null");
    if (b && /^[A-Za-z]{2,30}$/.test(b.champion) && Number.isInteger(b.num) && b.num >= 0) return b;
  } catch (e) { /* storage blocked */ }
  return null;
}

function showBanner(b) {
  const head = document.querySelector(".head");
  head.classList.toggle("has-banner", !!b);
  head.style.setProperty("--banner", b ? `url("${splashUrl(b)}")` : "none");
}

async function skinsFor(champId) {
  try {
    const c = await (await fetch(`/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/champions/${champId}.json`)).json();
    const own = state.owned && new Set(state.owned.skins);
    return (c.skins || []).filter((k) => k.id % 1000 === 0 || !own || own.has(k.id))
      .map((k) => ({ num: k.id % 1000, name: k.id % 1000 ? k.name : "Default" }));
  } catch (e) { return [{ num: 0, name: "Default" }]; }
}

async function setupBanner() {
  const ids = Object.keys(state.champAlias).map(Number);
  if (!ids.length) return;
  const byAlias = Object.fromEntries(ids.map((id) => [state.champAlias[id], id]));
  const fallback = mostPlayed(1)[0];
  let banner = savedBanner() || (fallback ? { champion: fallback, num: 0 } : null);
  showBanner(banner);

  const champSel = $("banner-champ"), skinSel = $("banner-skin");
  const pool = state.owned ? state.owned.champions.filter((id) => state.champAlias[id]) : ids;
  champSel.innerHTML = pool.map((id) => [id, state.champNames[id] || state.champAlias[id]]).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name]) => `<option value="${state.champAlias[id]}">${esc(name)}</option>`).join("");
  $("banner-note").textContent = state.owned ? "Champions and skins you own" : "Import games to pick from the skins you own";

  async function fillSkins(alias, num) {
    const skins = await skinsFor(byAlias[alias]);
    skinSel.innerHTML = skins.map((k) => `<option value="${k.num}">${esc(k.name)}</option>`).join("");
    skinSel.value = String(skins.some((k) => k.num === num) ? num : 0);
  }
  function pick() {
    banner = { champion: champSel.value, num: +skinSel.value || 0 };
    try { localStorage.setItem(BANNER_KEY, JSON.stringify(banner)); } catch (e) { /* not remembered */ }
    showBanner(banner);
    linkRecentlyPlayed();
  }
  if (banner) { champSel.value = banner.champion; await fillSkins(banner.champion, banner.num); }
  champSel.onchange = async () => { await fillSkins(champSel.value, 0); pick(); };
  skinSel.onchange = pick;
  $("banner-btn").onclick = () => {
    const pickEl = $("banner-pick");
    pickEl.hidden = !pickEl.hidden;
    $("banner-btn").setAttribute("aria-expanded", String(!pickEl.hidden));
  };
}

// ---------- recorded games ----------
// The helper records each game while it's played. A recording is
// matched to its synced game by champion and start time, which supplies the result and damage.

const MATCH_WINDOW_MS = 5 * 60 * 1000;
const terrainName = (r) => (r.mapTerrain && r.mapTerrain !== "Default" ? r.mapTerrain.replace(/([a-z])([A-Z])/g, "$1 $2") : MAP_NAMES[r.map] || `Map ${r.map}`);
const lastSnap = (r) => r.snapshots[r.snapshots.length - 1] || { stats: {}, items: [], augments: [] };

function matchGame(r) {
  const champ = r.player.champion;
  let best = null;
  for (const g of state.games) {
    const dt = Math.abs(g.time - r.startedAt);
    if (dt < MATCH_WINDOW_MS && (champName(g) === champ || g.champNameRaw === champ) && (!best || dt < best.dt)) best = { g, dt };
  }
  return best && best.g;
}

// Augments in the order the game first reported them, with the game time each appeared.
function pickOrder(r) {
  const seen = new Map();
  for (const s of r.snapshots) for (const a of s.augments || []) {
    const id = typeof a === "object" ? a.id : a;
    if (id && !seen.has(id)) seen.set(id, s.t);
  }
  return [...seen.entries()].map(([id, t]) => ({ id, t }));
}

const augLabel = (id) => (typeof id === "number" || /^\d+$/.test(id) ? augName(id) : String(id));

function renderLive() {
  const recs = state.live.map((r) => ({ r, g: matchGame(r), last: lastSnap(r), picks: pickOrder(r) }));
  const st = (x, k) => Math.round(x.last.stats[k] || 0);
  table("t-live", [
    { label: "Date", get: (x) => x.r.startedAt, fmt: (x) => fmtDate(new Date(x.r.startedAt)) },
    { label: "Champion", get: (x) => x.r.player.champion || "", fmt: (x) => esc(x.r.player.champion || "") },
    { label: "Map", get: (x) => terrainName(x.r), fmt: (x) => esc(terrainName(x.r)) },
    { label: "Result", get: (x) => (x.g ? +x.g.win : -1), fmt: (x) => (x.g ? (x.g.win ? "Win" : "Loss") : "Not synced"), cls: (x) => (x.g ? (x.g.win ? "win" : "loss") : "") },
    { label: "Length", get: (x) => x.r.gameTime, fmt: (x) => mmss(x.r.gameTime) },
    { label: "Level", get: (x) => x.last.level || 0 },
    { label: "AD", get: (x) => st(x, "attackDamage") },
    { label: "AP", get: (x) => st(x, "abilityPower") },
    { label: "Health", get: (x) => st(x, "maxHealth") },
    { label: "Armor / MR", get: (x) => st(x, "armor"), fmt: (x) => `${st(x, "armor")} / ${st(x, "magicResist")}` },
    { label: "Damage", get: (x) => (x.g ? x.g.damage : 0), fmt: (x) => (x.g ? x.g.damage.toLocaleString() : "") },
    { label: "Augments in order", get: (x) => x.picks.length, cls: () => "augs",
      fmt: (x) => esc(x.picks.map((p) => `${augLabel(p.id)} (${mmss(p.t)})`).join(", ")) },
  ], recs, 0);

  const picks = new Map();
  for (const x of recs) if (x.g) x.picks.forEach((p, i) => {
    const k = p.id + "|" + i;
    const row = picks.get(k) || { id: p.id, pick: i + 1, n: 0, w: 0 };
    row.n++; row.w += x.g.win ? 1 : 0;
    picks.set(k, row);
  });
  table("t-picks", [
    { label: "Augment", get: (r) => augLabel(r.id), fmt: (r) => esc(augLabel(r.id)) },
    { label: "Pick", get: (r) => r.pick, fmt: (r) => ["1st", "2nd", "3rd"][r.pick - 1] || r.pick + "th" },
    { label: "Games", get: (r) => r.n },
    { label: "Win rate", get: (r) => r.w / r.n + r.n / 1e6, fmt: (r) => pct(r.w / r.n), cls: (r) => wrClass(r.w / r.n) },
  ], [...picks.values()], 3);

  const maps = group(recs.filter((x) => x.g).map((x) => ({ ...x.g, mapLabel: terrainName(x.r) })), (g) => g.mapLabel);
  wrBars("wr-map", maps.map((m) => ({ label: m.key, n: m.n, w: m.w })));
}

async function setupLive() {
  if (!helperOnline || state.sample) return;
  try {
    const res = await fetch("api/live", { cache: "no-store" });
    if (!res.ok) return;
    const live = await res.json();
    if (!live.enabled) return;
    state.live = (live.games || []).filter((r) => r && r.player && Array.isArray(r.snapshots));
    $("live-card").hidden = false;
    $("live-status").textContent = live.recording ? `Recording a game (${live.recording})` : `${state.live.length} recorded`;
    renderLive();
  } catch (e) { /* older helper without recording */ }
}
