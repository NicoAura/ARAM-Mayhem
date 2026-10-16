// Mayhem Guide: renders data.js (built from the client files by build_data.py).
(() => {
  const D = window.GUIDE_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const img = (src, cls = "icon") => `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const tierChip = (t) => (t ? `<span class="chip tier-${t.toLowerCase()}">${t}</span>` : "");
  const TIER_NAMES = { IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Plat", DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "GM", CHALLENGER: "Chall" };

  $("patch").textContent = `Patch ${D.patch.split(".").slice(0, 2).join(".")}`;

  // ---- Tabs (?tab= or #hash picks one, so other pages can link straight to it)
  const tabs = [...document.querySelectorAll("[data-tab]")];
  function show(id) {
    if (!tabs.some((t) => t.dataset.tab === id)) id = "overview";
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === id));
    for (const t of tabs) $(`panel-${t.dataset.tab}`).hidden = t.dataset.tab !== id;
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
  }
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));
  show(location.hash.slice(1) || new URLSearchParams(location.search).get("tab"));
  addEventListener("hashchange", () => show(location.hash.slice(1)));

  // ---- Overview
  $("hero").src = D.hero;
  const total = Object.values(D.augmentCounts).reduce((a, b) => a + b, 0);
  const facts = [
    ["Augments in the pool", total],
    ["Silver", D.augmentCounts.Silver],
    ["Gold", D.augmentCounts.Gold],
    ["Prismatic", D.augmentCounts.Prismatic],
    ["Quest augments", D.quests.length],
    ["ARAM challenges that count", D.challenges.filter((c) => c.mayhem).length],
  ];
  $("facts").innerHTML = facts.map(([l, v]) => `<div class="card fact"><span class="eyebrow">${l}</span><span class="value">${v}</span></div>`).join("");
  $("queues").innerHTML = D.queues.map((q) => `<span class="chip">${q.id} · ${esc(q.name.replace("ARAM: ", ""))}</span>`).join("");

  // ---- Quests
  $("quest-list").innerHTML = D.quests
    .map((q) => `
      <article class="card">
        <div class="row">${img(q.icon)}<div><div class="title">${esc(q.name)}</div>
          <div class="chips">${tierChip(q.tier)}${q.milestones.length > 1 ? `<span class="chip">${q.milestones.length} steps</span>` : ""}${q.inPool ? "" : '<span class="chip">Not in the pool</span>'}</div></div></div>
        <ol class="steps">${q.milestones
          .map((m) => `<li><span class="need">${fmt(m.need)}</span><span>${esc(m.quest)}${m.reward ? `<br><span class="reward">→ ${esc(m.reward)}</span>` : ""}</span></li>`)
          .join("")}</ol>
        ${q.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
      </article>`)
    .join("");

  // ---- Challenges
  const counted = D.challenges.filter((c) => c.mayhem).length;
  $("ch-intro").textContent =
    `${counted} of the ${D.challenges.length} ARAM challenges list ARAM: Mayhem among the queues they track, so your Mayhem games ` +
    "move them forward. Each one shows the value needed for every tier.";
  let progress = {};
  function renderChallenges() {
    const groups = [...new Set(D.challenges.map((c) => c.group))];
    $("challenge-groups").innerHTML = groups
      .map((g) => `
        <div><h2 class="section" style="margin:0.25rem 0 0.75rem">${esc(g)}</h2>
        <div class="grid">${D.challenges
          .filter((c) => c.group === g)
          .map((c) => {
            const p = progress[c.id];
            const tiers = c.tiers
              .map((t) => `<span class="${p && p.value >= t.value ? "done" : ""}">${TIER_NAMES[t.tier] || t.tier} <b>${fmt(t.value)}</b></span>`)
              .join("");
            const next = p && c.tiers.find((t) => p.value < t.value);
            const mine = p
              ? `<div class="progress"><span>You: <b>${fmt(p.value)}</b> · ${esc(TIER_NAMES[p.level] || p.level || "Unranked")}${
                  p.percentile != null ? ` · top ${fmt(p.percentile * 100)}%` : ""}</span>${
                  next ? `<div class="meter"><i style="width:${Math.min(100, (p.value / next.value) * 100)}%"></i></div><span class="muted">${fmt(next.value - p.value)} to ${TIER_NAMES[next.tier]}</span>` : '<span class="muted">Top tier reached</span>'}</div>`
              : "";
            return `<article class="card"><div class="row">${img(c.icon)}<div><div class="title">${esc(c.name)}</div>
              <div class="muted small">${esc(c.text)}</div></div></div>
              <div class="tiers">${tiers}</div>${c.mayhem ? "" : '<p class="note">Doesn\'t count Mayhem games.</p>'}${mine}</article>`;
          })
          .join("")}</div></div>`)
      .join("");
  }
  renderChallenges();

  // Live progress needs the site's /api/riot/challenges route (it holds the Riot key). Show the form only once it exists.
  const API = "/api/riot/challenges";
  fetch(API)
    .then((r) => { if (r.status !== 404) $("lookup").hidden = false; })
    .catch(() => {});
  $("lookup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const [gameName, tagLine] = String(f.get("riotId")).split("#").map((s) => s.trim());
    const msg = $("lookup-msg");
    if (!gameName || !tagLine) { msg.textContent = "Type your Riot ID with the #tag."; return; }
    msg.textContent = "Loading…";
    try {
      const r = await fetch(`${API}?${new URLSearchParams({ gameName, tagLine, platform: f.get("region") })}`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
      progress = Object.fromEntries((body.challenges || []).map((c) => [c.challengeId, c]));
      msg.textContent = `Showing ${gameName}#${tagLine}`;
      renderChallenges();
    } catch (err) {
      msg.textContent = `Couldn't load progress: ${err.message}`;
    }
  });

  // ---- Maps and extras
  $("map-list").innerHTML = D.maps
    .map((m) => `<div class="card"><img src="${esc(m.minimap)}" alt="${esc(m.name)} minimap" loading="lazy"><div class="title">${esc(m.name)}</div></div>`)
    .join("");
  $("item-list").innerHTML = D.items
    .map((i) => `<div class="row">${img(i.icon)}<div><div class="title">${esc(i.name)}</div>${i.text ? `<div class="muted small">${esc(i.text.split("\n").slice(0, 3).join(" · "))}</div>` : ""}</div></div>`)
    .join("");
  $("summon-list").innerHTML = D.summons
    .map((s) => `<div class="row">${img(s.icon, "icon round")}<div><div class="title">${esc(s.name)}</div><div class="muted small">${esc(s.text)}</div></div></div>`)
    .join("");
})();
