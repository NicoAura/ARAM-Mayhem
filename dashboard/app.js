// ARAM Mayhem stats dashboard. Reads a match archive entirely in the browser.
"use strict";

const QUEUE_NAMES = { 2400: "ARAM Mayhem", 2450: "ARAM Mayhem (2450)", 450: "ARAM" };

const state = {
  games: [],        // normalized rows for the archive owner, one per game
  champNames: {},   // championId -> name
  augNames: {},     // augmentId -> name
  augRarity: {},    // augmentId -> kSilver | kGold | kPrismatic
  owner: null,
  sample: false,
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
  try { data = JSON.parse(text); } catch (e) { return showError("That file isn't valid JSON."); }
  const raw = findGames(data);
  if (!raw.length) return showError("No games found in that file.");
  const owner = findOwner(data, raw);
  state.owner = owner;
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
  loadNames().then(render);
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
  };
}

// Champion and augment names; if unavailable the page falls back to ids.
async function loadNames() {
  try {
    const champs = await (await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json")).json();
    for (const c of champs) if (c.id > 0) state.champNames[c.id] = c.name;
  } catch (e) { console.warn("champion names unavailable", e); }
  for (const url of [
    "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/cherry-augments.json",
    "https://raw.communitydragon.org/latest/cdragon/arena/en_us.json",
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
  for (const id of ["f-patch", "f-queue", "f-from", "f-to", "f-champ", "f-minaug"]) $(id).addEventListener("input", render);
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
  renderChart(games);
  renderKillMap(games);
  renderChamps(games);
  renderAugs(games);
  renderGames(games);
}

function sum(games, f) { return games.reduce((t, g) => t + f(g), 0); }

function renderTiles(games) {
  const n = games.length;
  const wins = sum(games, (g) => g.win);
  const K = sum(games, (g) => g.kills), D = sum(games, (g) => g.deaths), A = sum(games, (g) => g.assists);
  const dmg = n ? sum(games, (g) => g.damage) / n : 0;
  const dur = n ? sum(games, (g) => g.duration) / n : 0;
  const tiles = [
    ["Games", n, `${wins} W · ${n - wins} L`],
    ["Win rate", n ? pct(wins / n) : "–", ""],
    ["KDA", n ? kda(K, D, A) : "–", n ? `${(K / n).toFixed(1)} / ${(D / n).toFixed(1)} / ${(A / n).toFixed(1)}` : ""],
    ["Damage to champions", n ? Math.round(dmg).toLocaleString() : "–", "per game"],
    ["Game length", n ? `${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")}` : "–", "average"],
    ["Champions played", new Set(games.map((g) => g.champId)).size, ""],
  ];
  $("tiles").innerHTML = tiles.map(([l, v, s]) =>
    `<div class="tile"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("");
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
const MINIMAP_BASE = "https://raw.communitydragon.org/latest/game/assets/maps/info/map12/";
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
  table("t-champs", [
    { label: "Champion", get: (r) => champName(r.sample) },
    { label: "Games", get: (r) => r.n },
    { label: "Win rate", get: (r) => r.w / r.n, fmt: (r) => pct(r.w / r.n) },
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
    { label: "Win rate", get: (r) => r.w / r.n, fmt: (r) => pct(r.w / r.n) },
  ], rows, 2);
}

function renderGames(games) {
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

for (const id of ["file", "file-2"]) {
  $(id).addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (f) loadText(await f.text());
    e.target.value = "";
  });
}
const loader = $("loader");
loader.addEventListener("dragover", (e) => { e.preventDefault(); loader.classList.add("drag"); });
loader.addEventListener("dragleave", () => loader.classList.remove("drag"));
loader.addEventListener("drop", async (e) => {
  e.preventDefault();
  loader.classList.remove("drag");
  const f = e.dataTransfer.files[0];
  if (f) loadText(await f.text());
});

// ---------- sync ----------
// Opened from the local sync helper, "Get all my Mayhem games" checks every
// match that can still be fetched and fills any gaps; "Import games from
// client" only adds games newer than the archive. Opened any other way, the
// buttons explain how to get there.

const syncBtns = [...document.querySelectorAll(".sync-btn")];
const syncStatus = $("sync-status");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OFFLINE_HINT = "Importing works when League is open on your Mac and this page is opened from Open Mayhem Stats.command.";
let helperOnline = false;

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
      setSyncStatus(summary + (failed ? ` ${failed} couldn't be fetched; import again to retry them.` : ""));
    }
  } catch (e) {
    setSyncStatus("Lost contact with the sync helper. Is it still running?", true);
  } finally {
    for (const b of syncBtns) b.disabled = false;
  }
}

const startSync = async (full) => {
  if (!helperOnline) {
    // the helper may have been started since the page loaded
    try { await syncState(); helperOnline = true; } catch (e) { return setSyncStatus(OFFLINE_HINT); }
  }
  setSyncStatus("Starting…");
  try {
    const res = await fetch(full ? "api/sync?full=1" : "api/sync", { method: "POST", headers: { "X-Mayhem": "1" } });
    if (!res.ok && res.status !== 409) throw new Error(String(res.status));
  } catch (e) {
    return setSyncStatus("Couldn't reach the sync helper.", true);
  }
  watchSync();
};
for (const b of syncBtns) b.addEventListener("click", () => startSync(b.dataset.full === "1"));

async function setupSync() {
  // The empty state already explains Sync, so this only picks up a running sync
  if (PRESET.sample || location.protocol === "file:") return;
  try {
    const s = await syncState();
    helperOnline = true;
    if (s.running) watchSync();
  } catch (e) { /* no helper; the button explains when pressed */ }
}

// When served next to a data file, load it automatically. ?data=path picks a different file.
(async () => {
  if (PRESET.sample) return loadText(JSON.stringify(PRESET.sample), { sample: true });
  const path = new URLSearchParams(location.search).get("data") || "data/mayhem-backup.json";
  if (location.protocol !== "file:") {
    try {
      const res = await fetch(path);
      if (res.ok) await loadText(await res.text());
    } catch (e) { /* no bundled data; wait for the file picker */ }
  }
  setupSync();
})();
