(() => {
  const D = window.GUIDE_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const img = (src, cls = "icon") => !src ? `<span class="${cls}"></span>` : `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  // ▲/▼ for a number going up or down; green when the change helps the player (lower cooldowns and costs help)
  const delta = (name, a, b) => {
    const mean = (v) => (Array.isArray(v) ? v.reduce((x, y) => x + y, 0) / v.length : v);
    const x = mean(a), y = mean(b);
    if (typeof x !== "number" || typeof y !== "number" || x === y) return "";
    const up = y > x, helps = /cooldown|cost|cd\b|delay|timer/i.test(name) ? !up : up;
    return ` <span class="${helps ? "up" : "down"}">${up ? "▲" : "▼"}</span>`;
  };
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

  $("story").innerHTML = (D.story || [])
    .map((e) => `<div class="row" style="align-items:flex-start"><span class="chip">${esc(e.date)}</span><p class="muted small" style="margin:0">${esc(e.text)}</p></div>`)
    .join("");

  // ---- Rules
  const R = D.rules, B = R.balance, F = R.onFire.values;
  const pct = (x) => `${fmt(x * 100)}%`;
  if (R.augmentLevels.length) $("aug-levels").textContent = `levels ${R.augmentLevels.join(", ").replace(/, (\d+)$/, " and $1")}`;
  const rules = [
    ["Augments", [
      `One augment at levels ${R.augmentLevels.join(", ")}.`,
      "Everyone picks from the same rarity at each selection.",
      "You choose augments while your champion is dead.",
      R.rerolls != null ? `Each selection shows ${R.cards} augments of one rarity, and each of the ${R.cards} can be rerolled ${R.rerolls === 1 ? "once" : `${fmt(R.rerolls)} times`}, so you can see up to ${R.cards * (1 + R.rerolls)}.` : "",
    ]],
    ["Attack speed and crits", [
      R.attackSpeedCap ? `Attack speed can go up to ${fmt(R.attackSpeedCap)} attacks per second${R.aramAttackSpeedCap ? ` (${fmt(R.aramAttackSpeedCap)} in regular ARAM)` : ""}.` : "",
      R.critOverflow === "adaptive" ? "Critical Strike Chance over 100% turns into Adaptive Force, which becomes Attack Damage or Ability Power, whichever you have more of." : "",
    ]],
    ["Combo Breaker", [`A Mayhem buff worth ${pct(R.comboBreakerTenacity)} Tenacity.`]],
    ["Melee champions", [`Bonus Health ${fmt(B.MeleeHealthBonus)}, up to ${fmt(B.MeleeHealthBonusMax)}.`, `${fmt(B.MeleeFlatArmor)} flat Armor.`]],
    ["Ranged champions", [`Bonus Health ${fmt(B.RangeHealthBonus)}, up to ${fmt(B.RangeHealthBonusMax)}.`,
      `Armor and Magic Resist ${fmt(B.RangeARMRBonus)}, up to ${fmt(B.RangeARMRBonusMax)}.`]],
    ["Everyone", [`${pct(B.TenacityAndSlowResBonus)} Tenacity and Slow Resist.`, `${pct(B.ManaRegenBonus)} Mana Regen, ${pct(B.EnergyRegenBonus)} Energy Regen.`,
      `Passive XP ${fmt(B.GeneralPassiveXP)}, passive gold ${fmt(B.PassiveGold)}.`]],
    ["Catch-up XP", [`Kicks in when a team falls ${fmt(B.LevelGapTrigger_EarlyGame)} levels behind, or ${fmt(B.LevelGapTrigger_LateGame)} after level ${fmt(B.LevelThreshold)}.`]],
    ["On Fire!", [R.onFire.text,
      `Burns enemies within ${fmt(F.ImmolateRadius)} units, +${pct(F.PercentAS)} Attack Speed, +${pct(F.RegularMS)} Move Speed (+${pct(F.MoveTowardsEnemyMS)} toward enemies), +${pct(F.ManaRegen)} Mana Regen.`,
      `The cost: ${pct(-F.GrievousAmount)} less healing and shielding, ${pct(F.DamageTakenAmp_Melee - 1)} more damage taken (${pct(F.DamageTakenAmp_Range - 1)} for ranged champions).`]],
  ];
  const M = R.mechanics || {};
  const mins = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const crit = M.critConversion;
  if (crit) rules[1][1].push(`Each 1% over 100% gives ${fmt(crit.adPerPercent)} Attack Damage or ${fmt(crit.apPerPercent)} Ability Power.`);
  if (M.longRange) rules.push(["Long-range damage", [
    `Champions take ${pct(1 - M.longRange.reductionMin)} to ${pct(1 - M.longRange.reductionMax)} damage from enemy champions more than ${fmt(M.longRange.range)} units away, less the farther they are.`,
    `Damage over time and ultimates aren't reduced.`]]);
  if (M.respawn) {
    const lv = Object.keys(M.respawn.byLevel);
    rules.push(["Levels and respawns", [
      `Everyone starts at level ${M.startLevel}.`,
      `Respawn takes ${Object.values(M.respawn.byLevel).map(fmt).join(" / ")} seconds at levels ${lv[0]} to ${lv[lv.length - 1]}.`,
      `After ${mins(M.respawn.scaleFrom)}, timers grow ${pct(M.respawn.scalePerStep)} each minute, up to ${pct(M.respawn.scaleCap - 1)} longer.`]]);
  }
  if (M.relics) rules.push(["Health relics", [
    `Taking a relic restores ${pct(M.relics.pickup)} of your missing health and mana.`,
    `${fmt(M.relics.delay)} seconds later a beam hits everyone within ${fmt(M.relics.radius)} units, either team, for ${pct(M.relics.beam)} of their missing health${M.relics.aramBeam !== M.relics.beam ? ` (${pct(M.relics.aramBeam)} in regular ARAM)` : ""}.`,
    `Outer relics first appear at ${mins(M.relics.firstOuter)} and inner ones at ${mins(M.relics.firstInner)}, then return ${fmt(M.relics.respawn)} seconds after each beam.`]]);
  if (M.minions) rules.push(["Minions", [
    M.minions.aoeMultiplier ? `Area damage deals ${pct(M.minions.aoeMultiplier)} damage to minions.` : "",
    M.minions.blackout ? `Siege and super minions have Blackout: they reveal hidden traps within ${fmt(M.minions.blackout.range)} units for ${fmt(M.minions.blackout.revealSeconds)} seconds.` : ""]]);
  if (M.structures) rules.push(["Late-game sieges", [
    `From ${mins(M.structures.from)} to ${mins(M.structures.to)}, champions' bonus damage to structures rises from 0 to ${pct(M.structures.bonusMax)}, and stays there.`]]);
  if (M.fastTravel?.length) rules.push(["Getting back to the fight", [
    ...M.fastTravel.map((f) => `${f.map}, ${f.name}: ${f.text}`),
    M.portalSpeed ? `Koeshin's Crossing portals also give ${pct(M.portalSpeed.bonus)} bonus Move Speed that fades over ${fmt(M.portalSpeed.seconds)} seconds.` : ""]]);
  if (R.aura?.length) rules.push(["Mayhemic Magic", ["Everyone has this Mayhem buff all game:", ...R.aura.map((l) => `• ${l}`)]]);
  $("rule-list").innerHTML = rules
    .map(([t, lines]) => `<article class="card"><div class="title">${esc(t)}</div>${lines.filter(Boolean).map((l) => `<p class="muted small" style="margin-top:0.4rem">${esc(l)}</p>`).join("")}</article>`)
    .join("");
  const CS = D.champSelect;
  if (CS) {
    const lines = [
      CS.runes ? "" : "There's no rune page. Your keystones come only from augments.",
      CS.notInMayhem.length ? `${CS.notInMayhem.join(", ")} ${CS.notInMayhem.length > 1 ? "aren't" : "isn't"} allowed, though regular ARAM has ${CS.notInMayhem.length > 1 ? "them" : "it"}.` : "",
    ].filter(Boolean);
    $("champ-select-intro").textContent = lines.join(" ");
    $("keystone-list").innerHTML = CS.keystoneAugments
      .map((a) => `<div class="row">${img(a.icon)}<div><div class="title">${esc(a.name)} ${tierChip(a.tier)}</div><div class="muted small">${esc(a.runes.join(" and "))}</div></div></div>`)
      .join("");
  }
  $("spell-list").innerHTML = D.spells
    .map((x) => `<div class="row" style="align-items:flex-start">${img(x.icon)}<div><div class="title">${esc(x.name)} <span class="muted small">${fmt(x.cooldown)}s</span></div><div class="muted small">${esc(x.text)}</div></div></div>`)
    .join("");
  $("spell-augment-list").innerHTML = D.spellAugments
    .map((x) => `<div class="row" style="align-items:flex-start">${img(x.icon)}<div><div class="title">${esc(x.name)} ${tierChip(x.tier)}</div><div class="muted small" style="white-space:pre-line">${esc(x.text)}</div></div></div>`)
    .join("");

  // ---- Augment stages
  const AR = D.augmentRules;
  if (AR) {
    const n = AR.levels.length, pct1 = (x) => `${fmt(x * 100)}%`;
    $("stages-intro").textContent =
      `You get ${n} augments a game, one per stage. Each selection shows ${AR.cards} augments of one rarity, and you can reroll each ` +
      `of the ${AR.cards} slots ${AR.rerollsPerSlot === 1 ? "once" : `${AR.rerollsPerSlot} times`}. You can still pick while you're dead.`;
    $("stage-list").innerHTML = AR.levels
      .map((lv, i) => `<div class="card fact"><span class="eyebrow">Stage ${i + 1}</span><span class="value">Level ${lv}</span></div>`)
      .join("");
    $("odds-rows").innerHTML = ["Silver", "Gold", "Prismatic"]
      .filter((t) => AR.odds[t])
      .map((t) => {
        const o = AR.odds[t], game = 1 - (1 - o.offer) ** n;
        return `<tr><td>${tierChip(t)}</td><td class="num">${o.pool}</td><td class="num"><b>${pct1(o.offer)}</b></td><td class="num">${pct1(o.withRerolls)}</td><td class="num">${pct1(game)}</td></tr>`;
      })
      .join("");
    $("odds-note").textContent =
      `The chance that one augment you want is among the ${AR.cards} cards when a selection of its rarity comes up, if every augment of that rarity is equally likely. ` +
      `"Using every reroll" counts each reroll as a fresh card. The last column is the chance it shows up at least once if all ${n} selections were that rarity.`;
    const extra = [...(AR.selectionAugments || []).map((a) => ({ ...a, how: a.tier })), ...(AR.goldenReroll?.name ? [{ name: AR.goldenReroll.name, icon: AR.goldenReroll.icon, text: `${AR.goldenReroll.text} A reward from the Mayhem progression track, not an augment.` }] : [])];
    $("selection-list").innerHTML = extra
      .map((a) => `<div class="row" style="align-items:flex-start">${img(a.icon)}<div><div class="title">${esc(a.name)} ${tierChip(a.tier)}</div><div class="muted small">${esc(a.text)}</div></div></div>`)
      .join("");
    const T = D.track;
    if (T) {
      const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const augs = T.levels.filter((r) => r.kind === "Augment").length;
      $("track-card").hidden = false;
      $("track-title").textContent = T.name;
      $("track-dates").textContent = `${day(T.start)} to ${day(T.end)}`;
      $("track-intro").textContent =
        `Playing Mayhem fills a ${T.size}-level track. ${augs} levels unlock a new augment, which can then show up in your selections; ` +
        "the rest give emotes, icons, a title and other rewards." +
        (T.totalXp ? ` The track is free and takes ${fmt(T.totalXp)} Mayhem XP in all. ${T.guaranteed || ""}` : "");
      $("track-xp").innerHTML = (T.objectives || [])
        .map((o) => `<span class="chip">${esc(o.text)}: ${fmt(o.xp)} XP${o.per === "once" ? " (once)" : ` per ${o.per}`}</span>`).join("");
      $("track-list").innerHTML = T.levels
        .map((r) => `<div class="row">${r.icon ? img(r.icon) : ""}<div><div class="eyebrow">Level ${r.level} · ${esc(r.kind)}${r.xp ? ` · ${fmt(r.xp)} XP` : ""}</div><div class="title">${esc(r.name)} ${tierChip(r.tier)}</div>${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ""}</div></div>`)
        .join("");
    }
    const gi = AR.grantedItems.filter((g, i, all) => all.findIndex((x) => x.name === g.name) === i);
    $("granted-intro").textContent =
      "Rewards can't be bought, so build stats on the champion pages leave them out. Free items are handed over at once, but you can also buy them.";
    $("granted-list").innerHTML = gi
      .map((g) => `<div class="row">${img(g.icon)}<div><div class="title">${esc(g.name)} <span class="chip">${g.how === "reward" ? "Reward" : "Free"}</span></div>
        <div class="muted small">From ${esc(g.augment)} ${tierChip(g.augmentTier)}</div></div></div>`)
      .join("");
  }

  // ---- Items
  const words = (n) => n.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/_/g, " ");
  const exact = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
  $("items-intro").textContent = `${D.itemChanges.length} items have their own values in Mayhem. Each row is one value that changes.`;
  $("item-changes").innerHTML = D.itemChanges
    .flatMap((it) => it.changes.map((c, i) => `<tr>${i === 0 ? `<td rowspan="${it.changes.length}"><div class="row">${img(it.icon)}<span class="title">${esc(it.name)}</span></div></td>` : ""}
      <td>${esc(words(c.name))}</td><td class="num">${c.rift == null ? "–" : exact(c.rift)}</td><td class="num"><b>${c.mayhem == null ? "–" : exact(c.mayhem)}</b>${delta(c.name, c.rift, c.mayhem)}</td></tr>`))
    .join("");

  // ---- Archive
  $("set-list").innerHTML = D.augmentSets
    .map((x) => `<div><div class="title">${esc(x.name)}</div><div class="muted small">${esc(x.bonus)}</div></div>`)
    .join("");

  // ---- Augment history
  const H = window.GUIDE_HISTORY;
  if (H) {
    $("history-intro").textContent =
      `From patch ${H.from} to ${H.to}, the augment pool went from ${H.startPool} to ${H.pool}. Newest patch first; ` +
      "each change shows the old value and the new one.";
    const val = (v) => (v == null ? "–" : Array.isArray(v) ? v.map(exact).join(" / ") : typeof v === "number" ? exact(v) : esc(v));
    const aug = (id) => H.augments[id] || { name: id };
    const augRow = (id, extra = "") => {
      const a = aug(id);
      return `<div class="row" style="align-items:flex-start">${img(a.icon)}<div><div class="title">${esc(a.name)} ${tierChip(a.tier)}</div>${extra}</div></div>`;
    };
    function renderHistory() {
      const q = $("history-search").value.trim().toLowerCase();
      const hit = (id) => !q || aug(id).name.toLowerCase().includes(q);
      const blocks = H.patches.map((p) => {
        const added = p.added.filter(hit), removed = p.removed.filter(hit), changed = p.changed.filter((c) => hit(c.id));
        if (!added.length && !removed.length && !changed.length) return "";
        const list = (title, ids) => (ids.length ? `<div><div class="eyebrow" style="margin-bottom:0.5rem">${title} (${ids.length})</div>
          <div class="grid tight">${ids.map((id) => augRow(id)).join("")}</div></div>` : "");
        return `<div class="card"><div class="card-head"><h2>Patch ${esc(p.patch)}</h2></div><div class="panel">
          ${changed.length ? `<div class="grid">${changed.map((c) => augRow(c.id, c.changes.map((r) =>
            `<div class="small"><span class="muted">${esc(words(r.name))}:</span> ${val(r.old)} → <b>${val(r.new)}</b>${delta(r.name, r.old, r.new)}</div>`).join(""))).join("")}</div>` : ""}
          ${list("Added to the pool", added)}${list("Removed from the pool", removed)}</div></div>`;
      }).join("");
      $("history-list").innerHTML = blocks;
      $("history-empty").hidden = !!blocks;
    }
    $("history-search").addEventListener("input", renderHistory);
    renderHistory();
  }

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

  // The site answers the lookup; the page only calls it once a Riot ID is entered.
  const API = "/api/riot/challenges";
  $("lookup").hidden = false;
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
