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
    "Pick one to see its Mayhem builds, augments, skill order, best teammates and ability changes.";

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
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const itemImg = (id) => {
    const it = D.items[id];
    return it ? `<img src="${esc(it.icon)}" alt="${esc(it.name)}" title="${esc(it.name)}" loading="lazy">` : "";
  };

  function renderPage(c) {
    const ab = Object.fromEntries(c.abilities.map((a) => [a.slot, a]));
    const facts = c.tier
      ? [["Tier List rank", `#${c.tier.rank} of ${c.tier.of}`], ["Win rate", pct(c.tier.winRate)], ["Pick rate", pct(c.tier.pickRate)],
         ["Damage share", pct(c.tier.damage)], ["Damage taken share", pct(c.tier.tank)]]
      : [];
    const changes = c.mayhem.length
      ? `<div class="table-wrap"><table class="changes">
          <thead><tr><th>Ability</th><th>Value</th><th class="num">Rift</th><th class="num">Mayhem</th></tr></thead>
          <tbody>${c.mayhem.map((m) => {
            const a = ab[m.slot] || {};
            const up = avg(m.mayhem) > avg(m.rift);
            return `<tr><td><div class="row">${img(a.icon, "icon")}<div><span class="slot">${m.slot}</span> <span class="ability-name">${esc(a.name || "")}</span></div></div></td>
              <td>${esc(words(m.name))}</td><td class="num" data-label="Rift">${values(m.name, m.rift)}</td>
              <td class="num" data-label="Mayhem"><b>${values(m.name, m.mayhem)}</b> <span class="muted">${up ? "↑" : "↓"}</span></td></tr>`;
          }).join("")}</tbody></table></div>
          <p class="muted small">Ranks run left to right.</p>`
      : `<p class="muted">Mayhem doesn't change any of ${esc(c.name)}'s ability numbers.</p>`;
    const B = c.builds;
    const rate = (r) => `<span class="rates"><span><b>${pct(r.win)}</b> win</span><span>${pct(r.pick)} pick</span></span>`;
    const itemRow = (r, sep = "") => `<div class="build-row"><div class="items">${r.items.map(itemImg).join(sep)}</div>${rate(r)}</div>`;
    const block = (title, rows, sep, hint = "") => (rows && rows.length
      ? `<div class="card"><div class="card-head"><h2>${title}</h2>${hint ? `<span class="muted small">${hint}</span>` : ""}</div>
          <div class="build-list">${rows.map((r) => itemRow(r, sep)).join("")}</div></div>`
      : "");
    const TIERS = [["prismatic", "Prismatic"], ["gold", "Gold"], ["silver", "Silver"]];
    const augs = B && B.augments
      ? `<div class="card"><div class="card-head"><h2>Augments</h2><span class="muted small">Most picked by ${esc(c.name)} players</span></div>
          <div class="aug-cols">${TIERS.filter(([k]) => (B.augments[k] || []).length).map(([k, l]) => `<div>
            <div class="eyebrow" style="margin-bottom:0.5rem">${l}</div>
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
          return x ? `<a class="champ" href="#${esc(x.alias)}">${img(x.icon)}<div><div class="title">${esc(x.name)}</div><div class="muted small">${pct(m.win)} win together</div></div></a>` : "";
        }).join("")}</div></div>`
      : "";
    const builds = B
      ? `${augs}
        <div class="grid">${block("Starting items", B.start, "")}${block("Boots", B.boots, "")}</div>
        ${block("Core items", B.core, '<span class="arrow">›</span>', "First three items, in order")}
        ${block("Full builds", B.full, "")}
        ${block("Most-built items", B.first, "", "Share of games with the item")}
        <div class="grid">${skills}${mates}</div>`
      : '<p class="muted">No build stats for this champion yet.</p>';

    $("page").innerHTML = `
      <a class="back" href="#">← All champions</a>
      <div class="banner" style="background-image:url('${esc(c.splash)}')"><div>
        <span class="eyebrow">${c.roles.map((r) => ROLE[r] || r).join(" · ")}</span>
        <h1>${esc(c.name)}</h1>
        <span>${esc(c.title)}</span>
        ${c.vo ? '<button class="btn" type="button" id="vo">▶ Pick quote</button>' : ""}
      </div></div>
      ${facts.length ? `<div class="facts">${facts.map(([l, v]) => `<div class="card fact"><span class="eyebrow">${l}</span><span class="value">${v}</span></div>`).join("")}</div>` : ""}
      ${builds}
      <div class="card">
        <div class="card-head"><h2>Mayhem changes</h2></div>
        ${changes}
        <p class="note">Mayhem also adjusts some champions' damage dealt, damage taken, healing and ability haste. Those adjustments
          aren't shown here.</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>Abilities</h2></div>
        <div class="grid">${c.abilities.map((a) => `<div class="ability">${img(a.icon)}<div><div class="title"><span class="slot">${a.slot}</span> ${esc(a.name)}
          ${a.cooldown && a.cooldown.some((x) => x) ? `<span class="muted small">${values("Cooldown", a.cooldown)}s</span>` : ""}</div>
          <div class="muted small" style="white-space:pre-line;margin-top:0.2rem">${esc(a.text)}</div></div></div>`).join("")}</div>
      </div>
      ${c.tier ? '<p class="small"><a href="/tier-list" target="_top">See the full Tier List →</a></p>' : ""}`;
    const vo = $("vo");
    if (vo) vo.addEventListener("click", () => new Audio(c.vo).play().catch(() => {}));
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
