// The list is the default view; #Alias opens one champion's page.
(() => {
  const D = window.CHAMPS_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const num = (n, d = 2) => Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
  const pct = (x, d = 1) => `${num(x * 100, d)}%`;
  const img = (src, cls = "icon", alt = "") => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">` : "");
  const words = (n) => n.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/_/g, " ");
  const ROLE = { assassin: "Assassin", fighter: "Fighter", mage: "Mage", marksman: "Marksman", support: "Support", tank: "Tank" };
  const byAlias = Object.fromEntries(D.champions.map((c) => [c.alias.toLowerCase(), c]));

  const patch = D.patch.split(".").slice(0, 2).join(".");
  $("patch").textContent = `Patch ${patch}`;
  const changed = D.champions.filter((c) => c.mayhem.length).length;
  $("list-intro").textContent =
    `${D.champions.length} champions. ${changed} of them have abilities that Mayhem changes. ` +
    "Pick one to see its Mayhem builds by style, augments, skill order, best teammates and ability changes.";

  // ---- List
  const filters = [["all", "All"], ["changed", "Mayhem changes"], ...Object.entries(ROLE)];
  let filter = "all";
  $("filters").innerHTML = filters.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join("");
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    for (const x of $("filters").children) x.setAttribute("aria-pressed", String(x === b));
    renderList();
  });
  $("search").addEventListener("input", renderList);

  function renderList() {
    const q = $("search").value.trim().toLowerCase();
    const shown = D.champions.filter((c) =>
      (!q || c.name.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "changed" ? c.mayhem.length : c.roles.includes(filter))));
    $("roster").innerHTML = shown
      .map((c) => `<a class="champ" href="#${esc(c.alias)}">${img(c.icon)}<div><div class="title">${esc(c.name)}</div>
        <div class="chips">${c.tier ? `<span class="chip">#${c.tier.rank}</span>` : ""}${c.mayhem.length ? `<span class="chip tier-gold">${c.mayhem.length} change${c.mayhem.length > 1 ? "s" : ""}</span>` : ""}</div></div></a>`)
      .join("");
    $("empty").hidden = shown.length > 0;
  }

  // ---- One champion
  // Ratios and percentages are stored as fractions (0.6 = 60%). Match whole words: "Duration" contains "ratio".
  const PCT_WORDS = new Set(["ratio", "percent", "pct", "amp", "mod", "multiplier"]);
  const isPct = (name, vals) => words(name).toLowerCase().split(/\s+/).some((w) => PCT_WORDS.has(w)) && vals.every((v) => Math.abs(v) <= 5);
  function values(name, vals) {
    const f = (v) => (isPct(name, vals) ? pct(v, Math.abs(v) < 0.01 ? 3 : 1) : num(v));
    const uniq = [...new Set(vals)];
    return uniq.length === 1 ? f(uniq[0]) : vals.map(f).join(" / ");
  }
  // Win rates: green at 52% or more, red at 48% or less
  const wr = (x, d = 1) => `<span class="${x >= 0.52 ? "wr-high" : x <= 0.48 ? "wr-low" : ""}">${pct(x, d)}</span>`;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const itemImg = (id) => {
    const it = D.items[id];
    return it ? `<img src="${esc(it.icon)}" alt="${esc(it.name)}" title="${esc(it.name)}" loading="lazy">` : "";
  };

  // Base stats at level 1 and 18. Growth per level follows the game's curve, so 17 levels add 17 times the growth.
  const STATS = [["hp", "Health"], ["hp5", "Health regen (per 5s)"], ["resource"], ["ad", "Attack damage"], ["as", "Attack speed"],
    ["armor", "Armor"], ["mr", "Magic resist"]];
  function statsCard(s) {
    if (!s) return "";
    const rows = [];
    for (const [k, label] of STATS) {
      if (k === "resource") {
        if (s.resource) {
          const r = s.resource;
          rows.push([r.kind, r.base[0], r.base[1], r.base[0] + 17 * r.base[1]]);
          rows.push([`${r.kind} regen (per 5s)`, r.regen[0], r.regen[1], r.regen[0] + 17 * r.regen[1]]);
        }
        continue;
      }
      const [base, per] = s[k];
      if (k === "as") rows.push([label, base, `${num(per, 2)}%`, base * (1 + (17 * per) / 100)]);
      else rows.push([label, base, per, base + 17 * per]);
    }
    rows.push(["Attack range", s.range, "", s.range], ["Move speed", s.ms, "", s.ms]);
    const cell = (v, d) => (typeof v === "number" ? num(v, d) : esc(v));
    return `<div class="card"><div class="card-head"><h2>Base stats</h2><span class="muted small">Before items, augments and Mayhem's bonuses</span></div>
      <div class="table-wrap"><table class="stats"><thead><tr><th>Stat</th><th class="num">Level 1</th><th class="num">Per level</th><th class="num">Level 18</th></tr></thead>
      <tbody>${rows.map(([l, a, b, z]) => `<tr><td>${esc(l)}</td><td class="num">${cell(a, 3)}</td><td class="num">${b === "" ? "–" : cell(b, 3)}</td><td class="num"><b>${cell(z, l === "Attack speed" ? 3 : 1)}</b></td></tr>`).join("")}</tbody></table></div></div>`;
  }

  // Mayhem's per-champion adjustments live in modifiers.js, loaded once
  const MOD_NAMES = { damage_dealt: "Damage dealt", damage_taken: "Damage taken", healing: "Healing done", shielding: "Shielding done",
    tenacity: "Tenacity", ability_haste: "Ability haste", attack_speed: "Total attack speed", energy_regen: "Energy regen" };
  function loadMods(c) {
    const show = () => {
      const el = $("mods");
      if (!el) return;
      const m = (window.CHAMPS_MODIFIERS || {})[c.alias] || {};
      const keys = Object.keys(m);
      // taking more damage is bad for the champion; everything else is good when it goes up
      const good = (k, v) => (k === "damage_taken" ? v < 0 : v > 0);
      el.innerHTML = keys.length
        ? `<p class="muted small" style="margin:0.75rem 0 0.5rem">Mode-wide adjustments for ${esc(c.name)}:</p><div class="chips">${keys
            .map((k) => { const v = m[k], n = k === "ability_haste" ? num(v) : `${num(v * 100)}%`;
              return `<span class="chip ${good(k, m[k]) ? "mod-up" : "mod-down"}">${MOD_NAMES[k] || k} ${v > 0 ? "+" : ""}${n}</span>`; })
            .join("")}</div>`
        : `<p class="note">No mode-wide damage, healing or shielding adjustments for ${esc(c.name)}.</p>`;
    };
    if (window.CHAMPS_MODIFIERS) return show();
    const sc = document.createElement("script");
    sc.src = "modifiers.js";
    sc.onload = show;
    document.head.appendChild(sc);
  }

  // Skins live in skins.js, loaded the first time a champion page's skins section comes into view
  let skinsReady = null;
  function loadSkins(c) {
    const box = $("skins");
    const render = () => {
      const list = (window.CHAMPS_SKINS || {})[c.id] || [];
      $("skins-count").textContent = list.length ? `${list.length} skin${list.length > 1 ? "s" : ""}` : "";
      box.innerHTML = list.map((s) => `<figure class="skin">${img(s.tile, "", s.name)}<figcaption>${esc(s.name)}</figcaption></figure>`).join("")
        || '<p class="muted">No skins to show.</p>';
    };
    const start = () => {
      skinsReady ||= new Promise((ok) => {
        const sc = document.createElement("script");
        sc.src = "skins.js";
        sc.onload = sc.onerror = ok;
        document.head.appendChild(sc);
      });
      skinsReady.then(() => { if (box.isConnected) render(); });
    };
    if (window.CHAMPS_SKINS || !("IntersectionObserver" in window)) return start();
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: "400px" });
    io.observe($("skins-card"));
  }

  function renderPage(c) {
    const ab = Object.fromEntries(c.abilities.map((a) => [a.slot, a]));
    const facts = c.tier
      ? [["Tier List rank", `#${c.tier.rank} of ${c.tier.of}`], ["Win rate", wr(c.tier.winRate)], ["Pick rate", pct(c.tier.pickRate)],
         ["Damage share", pct(c.tier.damage)], ["Damage taken share", pct(c.tier.tank)]]
      : [];
    const changes = c.mayhem.length
      ? `<div class="table-wrap"><table class="changes">
          <thead><tr><th>Ability</th><th>Value</th><th class="num">Rift</th><th class="num">Mayhem</th></tr></thead>
          <tbody>${c.mayhem.map((m) => {
            const a = ab[m.slot] || {};
            const up = avg(m.mayhem) > avg(m.rift);
            const helps = /cooldown|cost/i.test(m.name) ? !up : up;
            return `<tr><td><div class="row">${img(a.icon, "icon")}<div><span class="slot">${m.slot}</span> <span class="ability-name">${esc(a.name || "")}</span></div></div></td>
              <td>${esc(words(m.name))}</td><td class="num" data-label="Rift">${values(m.name, m.rift)}</td>
              <td class="num" data-label="Mayhem"><b>${values(m.name, m.mayhem)}</b> <span class="${helps ? "up" : "down"}">${up ? "▲" : "▼"}</span></td></tr>`;
          }).join("")}</tbody></table></div>
          <p class="muted small">Ranks run left to right.</p>`
      : `<p class="muted">Mayhem doesn't change any of ${esc(c.name)}'s ability numbers.</p>`;
    const B = c.builds;
    const rate = (r) => `<span class="rates"><span><b>${wr(r.win)}</b> win</span><span>${pct(r.pick)} pick</span></span>`;
    const itemRow = (r, sep = "") => `<div class="build-row"><div class="items">${r.items.map(itemImg).join(sep)}</div>${rate(r)}</div>`;
    const block = (title, rows, sep, hint = "") => (rows && rows.length
      ? `<div class="card"><div class="card-head"><h2>${title}</h2>${hint ? `<span class="muted small">${hint}</span>` : ""}</div>
          <div class="build-list">${rows.map((r) => itemRow(r, sep)).join("")}</div></div>`
      : "");
    const TIERS = [["prismatic", "Prismatic"], ["gold", "Gold"], ["silver", "Silver"]];
    const augs = B && B.augments
      ? `<div class="card"><div class="card-head"><h2>Augments</h2><span class="muted small">Most picked by ${esc(c.name)} players</span></div>
          <div class="aug-cols">${TIERS.filter(([k]) => (B.augments[k] || []).length).map(([k, l]) => `<div>
            <div class="eyebrow tier-label-${k}" style="margin-bottom:0.5rem">${l}</div>
            ${B.augments[k].map((x) => {
              const a = D.augments[x.id] || { name: `#${x.id}` };
              return `<div class="aug-row">${a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy">` : ""}<span class="name">${esc(a.name)}</span>
                ${x.grade ? `<span class="chip grade-${esc(x.grade.toLowerCase())}">${esc(x.grade)}</span>` : ""}<span class="muted mono">${pct(x.pick)}</span></div>`;
            }).join("")}</div>`).join("")}</div></div>`
      : "";
    const icon = (slot) => (ab[slot] ? img(ab[slot].icon, "skill-icon", slot) : "");
    const skills = B && B.skills.length
      ? `<div class="card"><div class="card-head"><h2>Skill order</h2></div><div class="build-list">${B.skills.map((s) => {
          const o = s.orders[0];
          return `<div class="skill"><div class="build-row"><div class="max">${[...s.max].map((k) => `${icon(k)}<b>${k}</b>`).join('<span class="muted">›</span>')}</div>${rate(s)}</div>
            ${o ? `<div class="levels">${[...o.levels].map((k, i) => `<span class="lv k-${k}" title="Level ${i + 1}">${k}</span>`).join("")}</div>` : ""}</div>`;
        }).join("")}</div><p class="muted small">Max order first, then the most common level-by-level order for it.</p></div>`
      : "";
    const byId = Object.fromEntries(D.champions.map((x) => [x.id, x]));
    const mates = B && B.mates.length
      ? `<div class="card"><div class="card-head"><h2>Best teammates</h2></div><div class="mates">${B.mates.map((m) => {
          const x = byId[m.id];
          return x ? `<a class="champ" href="#${esc(x.alias)}">${img(x.icon)}<div><div class="title">${esc(x.name)}</div><div class="muted small">${wr(m.win)} win together</div></div></a>` : "";
        }).join("")}</div></div>`
      : "";
    const arrow = '<span class="arrow">›</span>';
    const augChip = (id) => {
      const a = D.augments[id] || { name: `#${id}` };
      return `<span class="aug-chip">${a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy">` : ""}${esc(a.name)}</span>`;
    };
    const styles = B && B.styles && B.styles.length
      ? `<div class="card"><div class="card-head"><h2>Builds by style</h2><span class="muted small">Share of the most common builds</span></div>
          <div class="styles">${B.styles.map((st) => `<section class="style">
            <div class="style-head"><h3>${esc(st.label)}</h3><span class="rates"><span><b>${wr(st.win)}</b> win</span><span>${pct(st.share, 0)} of builds</span></span></div>
            <div class="eyebrow">Core items, in order</div>
            <div class="build-list">${st.core.map((r) => itemRow(r, arrow)).join("")}</div>
            ${st.full.length ? `<div class="eyebrow">Full build</div><div class="build-list">${st.full.map((r) => itemRow(r)).join("")}</div>` : ""}
            ${st.items.length ? `<div class="eyebrow">Also fits</div><div class="items">${st.items.map(itemImg).join("")}</div>` : ""}
            ${st.augments.length ? `<div class="eyebrow">Augments that fit</div><div class="aug-chips">${st.augments.map(augChip).join("")}</div>` : ""}
          </section>`).join("")}</div></div>`
      : `${block("Core items", B && B.core, arrow, "First three items, in order")}${block("Full builds", B && B.full, "")}`;
    const builds = B
      ? `${augs}
        ${styles}
        <div class="grid">${block("Starting items", B.start, "")}${block("Boots", B.boots, "")}</div>
        ${block("Most-built items", B.first, "", "Share of games with the item")}
        <p class="muted small">Items that only augments give, like quest rewards, are left out of these builds.</p>
        <div class="grid">${skills}${mates}</div>`
      : '<p class="muted">No build stats for this champion yet.</p>';

    $("page").innerHTML = `
      <a class="back" href="#">← All champions</a>
      <div class="banner" style="background-image:url('${esc(c.splash)}')"><div>
        <span class="eyebrow">${c.roles.map((r) => ROLE[r] || r).join(" · ")}</span>
        <h1>${esc(c.name)}</h1>
        <span>${esc(c.title)}</span>
      </div></div>
      ${facts.length ? `<div class="facts">${facts.map(([l, v]) => `<div class="card fact"><span class="eyebrow">${l}</span><span class="value">${v}</span></div>`).join("")}</div>` : ""}
      ${builds}
      <div class="card">
        <div class="card-head"><h2>Mayhem changes</h2></div>
        ${changes}
        <div id="mods"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Abilities</h2></div>
        <div class="grid">${c.abilities.map((a) => `<div class="ability">${img(a.icon)}<div><div class="title"><span class="slot">${a.slot}</span> ${esc(a.name)}
          ${a.cooldown && a.cooldown.some((x) => x) ? `<span class="muted small">${values("Cooldown", a.cooldown)}s</span>` : ""}</div>
          <div class="muted small" style="white-space:pre-line;margin-top:0.2rem">${esc(a.text)}</div></div></div>`).join("")}</div>
      </div>
      ${statsCard(c.stats)}
      <div class="card" id="skins-card">
        <div class="card-head"><h2>Skins</h2><span class="muted small" id="skins-count"></span></div>
        <div class="skins" id="skins"></div>
      </div>
      ${c.tier ? '<p class="small"><a href="/tier-list" target="_top">See the full Tier List →</a></p>' : ""}`;
    loadSkins(c);
    loadMods(c);
    document.title = `${c.name} · Mayhem Champions`;
  }

  function route() {
    const c = byAlias[decodeURIComponent(location.hash.slice(1)).toLowerCase()];
    $("list").hidden = !!c;
    $("page").hidden = !c;
    if (c) {
      renderPage(c);
      scrollTo(0, 0);
    } else {
      document.title = "Mayhem Champions";
    }
  }
  renderList();
  route();
  addEventListener("hashchange", route);
})();
