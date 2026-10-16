(function () {
  const data = window.COOK_DATA;
  const TIERS = ["Secretly strong", "Holds up", "Pure troll", "Untested"];
  const TIER_NOTE = {
    "Secretly strong": "core augments win 55.5%+ in China",
    "Holds up": "core augments win 51.5 to 55.5%",
    "Pure troll": "core augments win under 51.5%",
    "Lab originals": "invented for this page",
  };
  const LAB = "Lab originals";
  const state = { tier: "All", sort: "tier" };

  const pct = (x, d = 1) => (x == null ? "–" : (x * 100).toFixed(d) + "%");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (path) => (window.COOK_ICONS && window.COOK_ICONS[path]) || path;

  function augRow(a, champ) {
    const rarity = a.rarity.toLowerCase();
    const stat = a.win_rate == null
      ? `<span class="muted">no data</span>`
      : `${pct(a.win_rate)}<small>#${a.win_rank} of ${data.meta.augment_count}</small>`;
    const best = a.champion_is_best ? `<span class="chip" title="${esc(champ)} is on China's best-champion list for this augment">best on ${esc(champ)}</span>` : "";
    return `<li class="${a.core ? "core" : "flex"}">
      <img src="${icon(a.icon)}" alt="" width="32" height="32" loading="lazy">
      <div>
        <div class="name">${esc(a.name)} <span class="chip ${rarity === "silver" ? "" : rarity}">${esc(a.rarity)}</span> ${best}</div>
        <div class="desc">${esc(a.text)}</div>
      </div>
      <div class="wr">${stat}</div>
    </li>`;
  }

  function simStat(b) {
    const s = b.sim;
    if (!s) return "";
    if (s.items_not_modeled.length >= 3) {
      return `<div><dt>Simulator</dt><dd><small>Can't model ${s.items_not_modeled.length} of these items</small></dd></div>`;
    }
    const missing = s.items_not_modeled.length ? ` <small>(${esc(s.items_not_modeled.join(", "))} not modeled)</small>` : "";
    const what = s.whole_build ? "Whole build" : "Item damage";
    return `<div><dt>${what} vs sim's top build</dt><dd>${pct(s.pct_of_best, 0)} <small>${s.dps} vs ${s.best_dps} DPS</small>${missing}</dd></div>
      <div><dt>Survives the sim fight</dt><dd>${pct(s.survival, 0)} <small>top build ${pct(s.best_survival, 0)}</small></dd></div>`;
  }

  function card(b) {
    return `<article class="card" id="${esc(b.id)}">
      <div class="card-head">
        <img src="${icon(b.champion_icon)}" alt="" width="52" height="52" loading="lazy">
        <div class="who">
          <h2>${esc(b.title)}</h2>
          <div class="sub">${esc(b.champion_name)} <span class="chip tier" title="${esc(TIER_NOTE[b.tier] || "")}">${esc(b.tier)}</span>${b.lab ? ` <span class="chip" title="Invented for this page">Lab original</span>` : ""}</div>
        </div>
        <div class="score"><span class="value">${pct(b.core_win_rate)}</span><span class="label">core augment win rate</span></div>
      </div>
      <p class="why">${esc(b.why)}</p>
      <p class="play muted"><b>How to play:</b> ${esc(b.play)}</p>
      <div class="cols">
        <div><h3>Augments</h3><ul class="augs">${b.augments.map((a) => augRow(a, b.champion_name)).join("")}</ul></div>
        <div><h3>Items</h3><ul class="items">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
      </div>
      <dl class="stats">
        <div><dt>${esc(b.champion_name)} in China</dt><dd>${pct(b.champion_win_rate)} <small>#${b.champion_win_rank} of ${data.meta.champion_count} by win rate</small></dd></div>
        ${simStat(b)}
      </dl>
    </article>`;
  }

  function sorted(list) {
    const by = {
      tier: (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || (b.core_win_rate || 0) - (a.core_win_rate || 0),
      core: (a, b) => (b.core_win_rate || 0) - (a.core_win_rate || 0),
      champ: (a, b) => (b.champion_win_rate || 0) - (a.champion_win_rate || 0),
      name: (a, b) => a.champion_name.localeCompare(b.champion_name),
    }[state.sort];
    return list.slice().sort(by);
  }

  function render() {
    const list = data.builds.filter((b) => state.tier === "All" || (state.tier === LAB ? b.lab : b.tier === state.tier));
    document.getElementById("builds").innerHTML = sorted(list).map(card).join("");
    for (const btn of document.querySelectorAll("#filters button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.tier === state.tier));
    }
  }

  const tiers = ["All"].concat(TIERS.filter((t) => data.builds.some((b) => b.tier === t)), data.builds.some((b) => b.lab) ? [LAB] : []);
  document.getElementById("filters").innerHTML = tiers
    .map((t) => {
      const n = t === "All" ? data.builds.length : data.builds.filter((b) => (t === LAB ? b.lab : b.tier === t)).length;
      return `<button type="button" data-tier="${esc(t)}" title="${esc(TIER_NOTE[t] || "")}">${esc(t)}<span class="count">${n}</span></button>`;
    })
    .join("");
  document.getElementById("filters").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.tier = btn.dataset.tier;
    render();
  });
  document.getElementById("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });

  const m = data.meta;
  const d = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : "?");
  document.getElementById("footer").innerHTML = `
    <p><b>Lab originals</b> are combos invented for this page rather than taken from players. Some come from searching every item for every champion in the simulator.</p>
    <p><b>Tier</b> is the average China-server win rate of a build's core augments (the ones without the "flex" tag): Secretly strong at 55.5% or more, Holds up from 51.5%, Pure troll below that. China doesn't publish augment win rates per champion, so "best on" marks the champions Tencent lists as best for that augment.</p>
    <p><b>Simulator</b> runs the build in the all-champion teamfight simulator against the simulator's own top build for that champion. When all of a build's augments are in the simulator the whole build is compared; otherwise only the items, both with the top build's augments. Over 100% means these items out-damage the simulator's pick, usually by dying more.</p>
    <p>China augment stats from ${d(m.cn_augment_date)}, champion stats from ${d(m.cn_champion_date)} (101.qq.com). Augment text and icons from the live client via CommunityDragon. Generated ${esc(m.generated)}.</p>`;

  render();
})();
