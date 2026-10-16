// ARAM Mayhem stats dashboard.
// Reads a match archive (the mayhem-archive / mayhem-backup.json format from the
// League client's local API, or Riot match-v5 JSON) entirely in the browser.
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

// A page can ship name tables and an example archive ahead of time (the
// published preview does, since it can't reach Riot's CDNs).
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
  const s = p.stats || p; // LCU nests stats; match-v5 is flat
  const augs = [1, 2, 3, 4, 5, 6].map((i) => s["playerAugment" + i]).filter((a) => a && a > 0);
  let time = info.gameCreation || Date.parse(info.gameCreationDate || "") || 0;
  // gameDuration is seconds in the LCU and newer match-v5, milliseconds in old match-v5
  let dur = info.gameDuration || 0;
  if (dur > 20000) dur = Math.round(dur / 1000);
  return {
    id: info.gameId || (g.metadata && g.metadata.matchId),
    time,
    queue: info.queueId,
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
  };
}

// Champion and augment names come from Riot's Data Dragon and CommunityDragon.
// If either is unreachable the page falls back to ids.
async function loadNames() {
  try {
    const vers = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
    const champs = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${vers[0]}/data/en_US/champion.json`)).json();
    for (const c of Object.values(champs.data)) state.champNames[c.key] = c.name;
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
function setupFilters() {
  const queues = [...new Set(state.games.map((g) => g.queue))].sort();
  const sel = $("f-queue");
  sel.innerHTML = '<option value="">All</option>' +
    queues.map((q) => `<option value="${q}">${QUEUE_NAMES[q] || "Queue " + q}</option>`).join("");
  const name = state.games.find((g) => g.name)?.name;
  const first = new Date(state.games[state.games.length - 1].time);
  const last = new Date(state.games[0].time);
  $("account").textContent = `${name ? name + " · " : ""}${state.games.length} games, ${fmtDate(first)} to ${fmtDate(last)}`;
  if (filtersReady) return;
  filtersReady = true;
  for (const id of ["f-queue", "f-from", "f-to", "f-champ", "f-minaug"]) $(id).addEventListener("input", render);
  $("f-reset").addEventListener("click", () => {
    for (const id of ["f-queue", "f-from", "f-to", "f-champ"]) $(id).value = "";
    render();
  });
}

function filtered() {
  const q = $("f-queue").value;
  const from = $("f-from").value ? Date.parse($("f-from").value) : -Infinity;
  const to = $("f-to").value ? Date.parse($("f-to").value) + 86400000 : Infinity;
  const champ = $("f-champ").value.trim().toLowerCase();
  return state.games.filter((g) =>
    (!q || String(g.queue) === q) && g.time >= from && g.time < to &&
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

// When served next to a data file (e.g. `python3 -m http.server` in this
// folder), load it automatically. ?data=path picks a different file.
(async () => {
  if (PRESET.sample) return loadText(JSON.stringify(PRESET.sample), { sample: true });
  const path = new URLSearchParams(location.search).get("data") || "data/mayhem-backup.json";
  if (location.protocol === "file:") return;
  try {
    const res = await fetch(path);
    if (res.ok) loadText(await res.text());
  } catch (e) { /* no bundled data; wait for the file picker */ }
})();
