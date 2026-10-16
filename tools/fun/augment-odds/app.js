(function () {
  "use strict";
  const data = window.ODDS_DATA;
  const art = window.ODDS_ART || {};
  const { compute, roll, TIERS } = window.OddsCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined ? "never" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
  const pct = (n) => `${fmt(n * 100, n < 0.1 ? 1 : 0)}%`;

  const MAX_TARGETS = 4, SHOWN = 30;
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  // Hunting Goldrend: one Prismatic offer a game plus the starting reroll.
  const PRESET = { targets: ["Goldrend"], rounds: { Silver: 1, Gold: 2, Prismatic: 1 }, rerolls: data.rerolls };
  const EMPTY = { targets: [], rounds: { Silver: 1, Gold: 2, Prismatic: 1 }, rerolls: data.rerolls };

  let build = load() || structuredClone(EMPTY);
  let query = "", tierFilter = "All";
  let rolls = { tier: null, count: 0, hits: 0 };

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") e.addEventListener("click", v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) e.append(k);
    return e;
  }

  function pickButton(a, { on, disabled, click, hit }) {
    return el("button", { class: on || hit ? "pick on" : "pick", title: a.text || a.name, disabled, "aria-pressed": on ? "true" : "false", on: click },
      el("img", { src: a.icon, alt: "", loading: "lazy" }), el("span", {}, a.name, el("span", { class: "tier" }, a.tier + (a.ability ? " · ability" : ""))));
  }

  // Tooltips keep the game's @placeholders@ and %i:icon% tags; the cards show the words around them.
  const plain = (t) => (t || "").replace(/@[^@]*@|\{\{[^}]*\}\}/g, "").replace(/%i:[^%]*%/g, "").replace(/\s+([.,:)])/g, "$1").replace(/\s{2,}/g, " ").replace(/\(\s+/g, "(").replace(/\(\)/g, "").trim();

  // One card of an offer, drawn on the game's augment-selection art.
  function offerCard(a, hit) {
    const t = a.tier.toLowerCase();
    // A few augments have no tooltip string, only its key (like GlassCannon_Summary); show nothing for those.
    const text = /\s/.test(plain(a.text)) ? plain(a.text) : "";
    const card = el("button", { type: "button", class: `card ${t}${hit ? " hit" : ""}`, title: hit ? "Your augment. Click to stop hunting it" : "Click to hunt this augment",
      style: `--art:url("${art.card}");--back:url("${art["back_" + t]}");--frame:url("${art["frame_" + t]}")`, on: () => toggle(a) },
      el("span", { class: "face" },
        el("span", { class: "emblem" }, ...(a.ability ? [el("span", { class: "frame" })] : []), el("img", { src: a.icon, alt: "" })),
        el("b", {}, a.name), el("span", { class: "rank" }, a.tier + (a.ability ? " · ability" : "")), el("p", {}, text)));
    if (hit) card.prepend(el("span", { class: "yours" }, "Wanted"));
    return card;
  }

  function toggle(a) {
    const on = build.targets.includes(a.key);
    if (on) build.targets = build.targets.filter((k) => k !== a.key);
    else if (build.targets.length < MAX_TARGETS) build.targets.push(a.key);
    update();
  }

  function renderPicker() {
    const q = query.trim().toLowerCase();
    const matches = data.augments.filter((a) => (tierFilter === "All" || a.tier === tierFilter) && (!q || a.name.toLowerCase().includes(q)));
    const shown = matches.slice(0, SHOWN);
    $("aug-picker").replaceChildren(...shown.map((a) => {
      const on = build.targets.includes(a.key);
      return pickButton(a, { on, disabled: !on && build.targets.length >= MAX_TARGETS, click: () => toggle(a) });
    }));
    $("aug-count").textContent = matches.length > SHOWN ? `Showing ${SHOWN} of ${matches.length}. Search to find the rest.` : `${matches.length} augments`;
    $("tier-filter").replaceChildren(...["All", ...TIERS].map((t) => el("button", {
      type: "button", class: t === tierFilter ? "" : "ghost", "aria-pressed": t === tierFilter ? "true" : "false",
      on: () => { tierFilter = t; renderPicker(); },
    }, t)));
  }

  function renderControls() {
    const slots = [];
    for (let i = 0; i < MAX_TARGETS; i++) {
      const a = build.targets[i] && augByKey(build.targets[i]);
      slots.push(a
        ? el("button", { class: "slot filled", title: `Remove ${a.name}`, "aria-label": `Remove ${a.name}`, on: () => toggle(a) }, el("img", { src: a.icon, alt: "" }))
        : el("button", { class: "slot", disabled: true, "aria-label": "Empty slot" }));
    }
    $("target-slots").replaceChildren(...slots);
    renderPicker();

    const num = (label, value, set, max = 10) => {
      const input = el("input", { type: "number", min: 0, max, step: 1, value, inputmode: "numeric" });
      input.addEventListener("input", () => { set(Math.max(0, Math.min(max, Math.floor(+input.value || 0)))); update(false); });
      return el("label", {}, label, input);
    };
    $("options").replaceChildren(
      ...TIERS.map((t) => num(`${t} offers per game`, build.rounds[t] ?? 0, (v) => { build.rounds[t] = v; })),
      num(`Rerolls (the game gives ${fmt(data.rerolls)})`, build.rerolls ?? data.rerolls, (v) => { build.rerolls = v; }, 20),
    );
  }

  function renderResult(r) {
    const names = r.targets.map((a) => a.name);
    $("aug-icon").src = r.targets[0] ? r.targets[0].icon : data.augments[0].icon;
    $("target-label").textContent = !names.length ? "it" : names.length === 1 ? names[0] : `one of ${names.length} augments`;
    $("chance").textContent = r.targets.length ? pct(r.perGame) : "–";
    $("no-reroll").textContent = r.targets.length ? pct(r.withoutRerolls) : "–";
    $("gain-bar").style.width = `${(r.perGame * 100).toFixed(2)}%`;
    const wantedTiers = r.tiers.filter((x) => x.wanted);
    $("chance-note").textContent = !r.targets.length
      ? "Pick an augment to see your odds."
      : wantedTiers.some((x) => !x.offers)
        ? `You get no ${wantedTiers.filter((x) => !x.offers).map((x) => x.tier).join(" or ")} offers, so those augments can't show up.`
        : "Your rerolls go to the tier where they help most.";

    const stats = r.targets.length ? [
      ["Games for a 50% chance", fmt(r.gamesFor(0.5))],
      ["Games for a 90% chance", fmt(r.gamesFor(0.9))],
      ["Games on average", r.perGame > 0 ? fmt(1 / r.perGame, 1) : "never"],
      ["Augments in the pool", fmt(data.augments.length)],
    ] : [["Augments in the pool", fmt(data.augments.length)], ...TIERS.map((t) => [t, fmt(data.augments.filter((a) => a.tier === t).length)])];
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    $("tiers").replaceChildren(el("tr", {}, ...["Tier", "Pool", "Wanted", "Per offer", "Offers + rerolls", "Per game"].map((h) => el("th", {}, h))),
      ...r.tiers.map((x) => el("tr", {}, el("td", {}, x.tier), el("td", {}, fmt(x.pool)), el("td", {}, fmt(x.wanted)),
        el("td", {}, x.wanted ? pct(x.perOffer) : "–"), el("td", {}, `${fmt(x.offers)}${x.rerolls ? ` + ${fmt(x.rerolls)}` : ""}`),
        el("td", {}, x.wanted ? pct(x.perGame) : "–"))));
  }

  function rollTier() {
    const t = build.targets.map(augByKey).find(Boolean);
    return t ? t.tier : tierFilter === "All" ? "Prismatic" : tierFilter;
  }

  function showOffer(offer, tier) {
    if (rolls.tier !== tier) rolls = { tier, count: 0, hits: 0 };
    rolls.count++;
    const hit = offer.some((a) => build.targets.includes(a.key));
    if (hit) rolls.hits++;
    $("offer").replaceChildren(...offer.map((a) => offerCard(a, build.targets.includes(a.key))));
    $("roll-count").textContent = `${fmt(rolls.count)} ${tier} ${rolls.count === 1 ? "offer" : "offers"} rolled, ${fmt(rolls.hits)} with your augment`;
    return hit;
  }

  function update(rerender = true) {
    if (rerender) renderControls();
    renderResult(compute(data, build));
    save();
  }

  function save() {
    const h = [build.targets.join("."), TIERS.map((t) => build.rounds[t] ?? 0).join("."), build.rerolls ?? data.rerolls].join("~");
    try { history.replaceState(null, "", `#${h}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const [targets, rounds, rerolls] = decodeURIComponent(location.hash.slice(1)).split("~");
      if (rounds === undefined) return null;
      const r = rounds.split(".").map(Number);
      return {
        targets: (targets ? targets.split(".") : []).filter((k) => augByKey(k)).slice(0, MAX_TARGETS),
        rounds: Object.fromEntries(TIERS.map((t, i) => [t, Math.max(0, r[i] || 0)])),
        rerolls: Math.max(0, +rerolls || 0),
      };
    } catch {
      return null;
    }
  }

  $("patch").textContent = `Game data: patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
  $("search").addEventListener("input", (e) => { query = e.target.value; renderPicker(); });
  $("roll").addEventListener("click", () => { const t = rollTier(); showOffer(roll(data, t), t); });
  $("roll-until").addEventListener("click", () => {
    const t = rollTier();
    if (!build.targets.some((k) => augByKey(k).tier === t)) { showOffer(roll(data, t), t); return; }
    for (let i = 0; i < 10000; i++) if (showOffer(roll(data, t), t)) break;
  });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); query = ""; $("search").value = ""; update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
