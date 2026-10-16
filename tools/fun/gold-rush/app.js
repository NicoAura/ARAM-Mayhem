(function () {
  "use strict";
  const data = window.GOLD_DATA;
  const { compute, defaults } = window.GoldCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !isFinite(n) ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
  const clock = (s) => (s === null ? "after 60:00" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

  const MAX_ITEMS = 6, MAX_AUGS = 4, SHOWN_ITEMS = 30;
  // Fastest full build found: a Sunfire tank with Goldrend, From Beginning To End, Donation and
  // Upgrade Immolate finishes six items at about 10:30, over 10 minutes sooner than without them (see README).
  const PRESET = {
    items: [3047, 3068, 3083, 3075, 3065, 6665],
    augments: ["Goldrend", "ARAM_FromBeginningToEnd", "Donation", "ARAM_Upgrade_Immolate"],
    opts: {},
  };
  const EMPTY = { items: [], augments: [], opts: {} };
  const DEF = defaults(data);

  const OPTIONS = [
    { key: "startGold", label: "Starting gold", def: DEF.startGold, step: 50 },
    { key: "passiveGold", label: `Passive gold every ${fmt(data.income.passiveInterval)} s`, def: DEF.passiveGold, step: 0.5 },
    { key: "kills", label: "Kills per minute", def: DEF.kills, step: 0.1 },
    { key: "killGold", label: "Gold per kill", def: DEF.killGold, step: 10 },
    { key: "assists", label: "Assists per minute", def: DEF.assists, step: 0.1 },
    { key: "assistGold", label: "Gold per assist (best guess)", def: DEF.assistGold, step: 5 },
    { key: "minions", label: "Minion last hits per minute", def: DEF.minions, step: 0.5 },
    { key: "minionGold", label: "Gold per minion", def: DEF.minionGold, step: 0.5 },
    { key: "hits", label: "Goldrend: champions hit every 30 s", aug: "Goldrend", def: DEF.hits, max: 5 },
    { key: "burnTicks", label: "Combusting Interest: burn ticks per minute", aug: "BloodMoneyBurn", def: DEF.burnTicks, step: 5 },
    { key: "burnDamage", label: "Combusting Interest: burn damage per minute", aug: "BloodMoneyBurn", def: DEF.burnDamage, step: 100 },
    { key: "coins", label: "Yowch: coins you grab per takedown", aug: "ARAM_YowchMyCoins", def: DEF.coins, max: 10 },
    { key: "fsProcs", label: "First Strike procs per minute", aug: "ARAM_FromBeginningToEnd", def: DEF.fsProcs, step: 0.5 },
    { key: "fsDamage", label: "First Strike: damage per proc window", aug: "ARAM_FromBeginningToEnd", def: DEF.fsDamage, step: 100 },
    { key: "fsRanged", label: "First Strike: ranged champion", aug: "ARAM_FromBeginningToEnd", type: "check", def: DEF.fsRanged },
    { key: "immolateTicks", label: "Immolate: target ticks per minute", aug: "ARAM_Upgrade_Immolate", def: DEF.immolateTicks, step: 5 },
    { key: "executes", label: "Collector executes per minute", aug: "ARAM_Upgrade_Collector", def: DEF.executes, step: 0.1 },
  ];

  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  let build = load() || structuredClone(EMPTY);
  let query = "";

  function canAddItem(it) {
    if (build.items.length >= MAX_ITEMS || build.items.includes(it.id)) return false;
    const owned = build.items.map(itemById);
    return !owned.some((o) => o.limitGroups.some((g) => it.limitGroups.includes(g)));
  }

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "on") e.addEventListener("click", v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) e.append(k);
    return e;
  }

  function pickButton(thing, sub, { on, disabled, click }) {
    return el("button", { class: on ? "pick on" : "pick", title: thing.text || thing.name, disabled, "aria-pressed": on ? "true" : "false", on: click },
      el("img", { src: thing.icon, alt: "", loading: "lazy" }), el("span", {}, thing.name, el("span", { class: "tier" }, sub)));
  }

  function slots(list, max, toThing, remove) {
    const out = [];
    for (let i = 0; i < max; i++) {
      const t = list[i] !== undefined ? toThing(list[i]) : null;
      out.push(t
        ? el("button", { class: "slot filled", title: `Remove ${t.name}`, "aria-label": `Remove ${t.name}`, on: () => remove(i) }, el("img", { src: t.icon, alt: "" }))
        : el("button", { class: "slot", disabled: true, "aria-label": "Empty slot" }));
    }
    return out;
  }

  // What an augment pays, in a few words, for the picker.
  function augSub(a) {
    const v = a.values;
    switch (a.kind) {
      case "hits": return `${fmt(v.GoldPerHit)} gold per champion hit`;
      case "burn": return `${fmt(a.calcs.GoldPerProc.lvl1)} to ${fmt(a.calcs.GoldPerProc.lvl18)} gold per burn tick`;
      case "coins": return `${fmt(v.GoldPerCoin)} gold per coin`;
      case "firstStrike": return `${fmt(v.GoldProcBonus)} gold per First Strike`;
      case "free": return `Free ${a.free.name} (${fmt(a.free.price)})`;
      case "immolate": return `${fmt(a.gold)} gold + ${fmt(v.GoldPerTick)} per tick`;
      case "execute": return `${fmt(a.gold)} gold + ${fmt(v.UpgradedGoldAmount)} per execute`;
      default: return `${fmt(a.gold)} gold · ${a.tier}`;
    }
  }

  function renderItems() {
    const q = query.trim().toLowerCase();
    const matches = data.items.filter((it) => !q || it.name.toLowerCase().includes(q));
    const shown = q ? matches : [...build.items.map(itemById), ...matches.filter((it) => !build.items.includes(it.id))].slice(0, SHOWN_ITEMS);
    $("item-count").textContent = !q && matches.length > SHOWN_ITEMS ? `${matches.length} items, search to find more` : "";
    $("item-picker").replaceChildren(...shown.map((it) => pickButton(it, `${fmt(it.price)} gold${it.boots ? " · boots" : ""}`, {
      on: build.items.includes(it.id), disabled: !build.items.includes(it.id) && !canAddItem(it),
      click: () => {
        if (build.items.includes(it.id)) build.items = build.items.filter((id) => id !== it.id);
        else if (canAddItem(it)) build.items.push(it.id);
        update();
      },
    })));
  }

  function numberInput(key, def, max, step) {
    const input = el("input", { type: "number", min: 0, max, step: step || 1, value: build.opts[key] ?? def, inputmode: "decimal" });
    input.addEventListener("input", () => { build.opts[key] = Math.max(0, Math.min(max ?? 1e5, +input.value || 0)); update(false); });
    return input;
  }

  function renderControls() {
    renderItems();
    $("item-slots").replaceChildren(...slots(build.items, MAX_ITEMS, itemById, (i) => { build.items.splice(i, 1); update(); }));
    $("aug-slots").replaceChildren(...slots(build.augments, MAX_AUGS, augByKey, (i) => { build.augments.splice(i, 1); update(); }));
    $("aug-picker").replaceChildren(...data.augments.map((a) => {
      const on = build.augments.includes(a.key);
      return pickButton(a, augSub(a), {
        on, disabled: !on && build.augments.length >= MAX_AUGS,
        click: () => { build.augments = on ? build.augments.filter((k) => k !== a.key) : [...build.augments, a.key]; update(); },
      });
    }));

    const rows = OPTIONS.filter((o) => !o.aug || build.augments.includes(o.aug)).map((o) => {
      if (o.type !== "check") return el("label", {}, o.label, numberInput(o.key, o.def, o.max, o.step));
      const input = el("input", { type: "checkbox", checked: !!(build.opts[o.key] ?? o.def) });
      input.addEventListener("input", () => { build.opts[o.key] = input.checked; update(false); });
      return el("label", {}, o.label, input);
    });
    // Mayhem offers augments during the game, so each one can start paying later.
    for (const k of build.augments) rows.push(el("label", {}, `${augByKey(k).name}: taken at minute`, numberInput(`at_${k}`, 0, 60, 0.5)));
    $("options").replaceChildren(...rows);
  }

  function renderResult(r) {
    const first = r.items[r.items.length - 1] || r.augs[0];
    $("hero-icon").src = first ? first.icon : data.augments[0].icon;
    $("done").textContent = r.items.length ? clock(r.done) : "–";
    $("saved").textContent = r.saved === null ? "–" : `${fmt(r.saved, 1)} min`;
    $("saved-note").textContent = !r.items.length ? "Pick items to see when your build is done."
      : !r.augs.length ? "Add gold augments to compare."
      : r.doneBase === null ? `Without them the build is not done by 60:00.`
      : `Without them the full build is done at ${clock(r.doneBase)}.`;
    $("gain-bar").style.width = r.done && r.doneBase ? `${Math.min(100, (r.done / r.doneBase) * 100)}%` : "0";

    const stats = [10, 20, 30].map((m) => [`Gold by ${m} min`, fmt(r.marks[m * 60]), r.augs.length ? `${fmt(r.marksBase[m * 60])} without augments` : ""]);
    stats.push(["Income from play", `${fmt(r.perMinute)} / min`, "passive, kills, assists, minions"]);
    stats.push(["Build cost", fmt(r.totalCost), `${r.items.length} of ${MAX_ITEMS} items`]);
    $("stats").replaceChildren(...stats.map(([k, v, s]) => el("div", {}, el("dt", {}, k), el("dd", {}, v), s ? el("dd", { class: "muted small" }, s) : "")));

    drawChart(r);

    const head = el("tr", {}, el("th", {}, "Item"), el("th", {}, "Price"), el("th", {}, "No augments"), el("th", {}, "Done at"));
    $("order").replaceChildren(head, ...r.items.map((it, i) => el("tr", {},
      el("td", {}, `${i + 1}. ${it.name}`), el("td", {}, fmt(it.price)), el("td", {}, clock(r.finishBase[i])), el("td", {}, clock(r.finish[i])))));
    if (!r.items.length) $("order").append(el("tr", {}, el("td", { colspan: 4, class: "muted" }, "No items picked yet.")));

    const aHead = el("tr", {}, el("th", {}, "Augment"), el("th", {}, "Pays"), el("th", {}, "Starts"), el("th", {}, "Gold by 30 min"));
    $("aug-table").replaceChildren(aHead, ...r.augments.map((a) => {
      const pays = [a.once ? `${fmt(a.once)} once` : "", a.rate ? `${fmt(a.rate)} / min` : "", a.aug.free ? `${a.aug.free.name}` : ""].filter(Boolean).join(" + ") || "–";
      const start = a.note === "needs item" ? "needs its item" : a.at === null ? "–" : clock(a.at);
      const gold = a.note === "unused" ? `no item uses ${a.aug.free.name}` : fmt(a.earned);
      return el("tr", {}, el("td", {}, a.aug.name), el("td", {}, pays), el("td", {}, start), el("td", {}, gold));
    }));
    if (!r.augments.length) $("aug-table").append(el("tr", {}, el("td", { colspan: 4, class: "muted" }, "No gold augments picked yet.")));
  }

  function drawChart(r) {
    const svg = $("chart"), a = r.series, b = r.seriesBase;
    const n = Math.max(a.length, b.length, 1800 / r.sample + 1);
    const max = Math.max(...a, ...b);
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, at) => { const e = document.createElementNS(ns, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
    const x = (i) => (i / (n - 1)) * 300;
    const y = (v) => 118 - (v / max) * 112;
    const path = (pts) => pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const kids = [];
    // A dashed mark at each item's finish, under its icon.
    for (const f of r.finish) if (f !== null) kids.push(mk("line", { class: "cap", x1: x(f / r.sample), x2: x(f / r.sample), y1: 0, y2: 120 }));
    if (r.augs.length) kids.push(mk("path", { class: "base", d: path(b) }));
    const line = path(a);
    kids.push(mk("path", { class: "area", d: `${line}L${x(a.length - 1).toFixed(1)},120L0,120Z` }), mk("path", { class: "line", d: line }));
    svg.replaceChildren(...kids);
    svg.setAttribute("aria-label", `Gold earned over time${r.done !== null ? `, full build at ${clock(r.done)}` : ""}`);

    // Item icons sit above the line at the second each item is finished.
    const pctX = (s) => `${(s / r.sample / (n - 1)) * 100}%`;
    $("chart-marks").replaceChildren(...r.items.map((it, i) => r.finish[i] === null ? "" :
      el("img", { src: it.icon, alt: "", title: `${it.name} at ${clock(r.finish[i])}`, style: `left:${pctX(r.finish[i])};top:${i % 2 ? 22 : 0}px` })));
    const ticks = [];
    for (let m = 0; m * 60 / r.sample < n; m += 10) ticks.push(el("span", { style: `left:${pctX(m * 60)}` }, `${m} min`));
    $("chart-axis").replaceChildren(...ticks);
    $("legend-base").hidden = !r.augs.length;
  }

  function update(rerender = true) {
    if (rerender) renderControls();
    renderResult(compute(data, build));
    save();
  }

  function save() {
    const h = [build.items.join("."), build.augments.join("."), encodeURIComponent(JSON.stringify(build.opts))].join("~");
    try { history.replaceState(null, "", `#${h}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const raw = decodeURIComponent(location.hash.slice(1));
      if (!raw) return null;
      const [items, augs, opts] = raw.split("~");
      const b = { items: [], augments: (augs ? augs.split(".") : []).filter((k) => augByKey(k)).slice(0, MAX_AUGS), opts: opts ? JSON.parse(opts) : {} };
      for (const id of items ? items.split(".").map(Number) : []) {
        const it = itemById(id);
        if (it && !b.items.includes(id) && b.items.length < MAX_ITEMS && !b.items.some((o) => itemById(o).limitGroups.some((g) => it.limitGroups.includes(g)))) b.items.push(id);
      }
      return b;
    } catch {
      return null;
    }
  }

  const inc = data.income;
  $("source").textContent = `Mayhem's starting gold (${fmt(inc.startingGold)}), passive gold (${fmt(inc.passiveGold, 1)} every ${fmt(inc.passiveInterval)} seconds from ${clock(inc.passiveStart)}), ` +
    `${fmt(inc.killGold)} gold per kill, minion gold (melee ${fmt(inc.minionGold.melee)}, caster ${fmt(inc.minionGold.ranged)})`;
  $("patch").textContent = `Game data: patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
  $("item-search").addEventListener("input", (e) => { query = e.target.value; renderItems(); });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); query = ""; $("item-search").value = ""; update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
