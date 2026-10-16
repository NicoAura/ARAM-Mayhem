(function () {
  "use strict";
  const data = window.SPEED_DATA;
  const { compute, capped, fasterThan, CAPS } = window.SpeedCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
  const pct = (n, d = 0) => `${fmt(n * 100, d)}%`;

  const MAX_ITEMS = 6, MAX_AUGS = 4, SHOWN_CHAMPS = 24;
  const AVG_BASE = data.champions.reduce((t, c) => t + c.ms, 0) / data.champions.length;
  // Every peak effect lined up at once on the fastest base speed: Tap Dancer's flat speed times a pile of % bonuses.
  const PRESET = {
    champion: "MasterYi",
    items: [3170, 6631, 3139, 3142, 2065, 3073],
    augments: ["ARAM_TapDancer", "ARAM_Homeguard", "ARAM_GetExcited", "ARAM_DivineDomain"],
    opts: { ARAM_TapDancer: 100, "6631c": 5, "3139q": true, "3142a": true, "2065a": true, "3073o": true,
      ARAM_GetExcited: true, ARAM_DivineDomain: true },
  };
  const EMPTY = { champion: "MasterYi", items: [], augments: [], opts: {} };

  // Inputs that are always there, next to the ones the picked items and augments bring.
  const BASE_OPTIONS = [
    { key: "level", label: "Champion level (for level-scaled augments)", type: "number", def: 18, max: 18 },
    { key: "otherFlat", label: "Other flat Move Speed (runes, passives)", type: "number", def: 0, step: 5 },
    { key: "otherPct", label: "Other Move Speed %", type: "number", def: 0, step: 5 },
    { key: "otherMult", label: "Other multiplier % (total Move Speed)", type: "number", def: 0, step: 5 },
    { key: "lane", label: "Lane length in units (rough guess)", type: "number", def: 10000, step: 500 },
  ];

  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  let build = load() || structuredClone(EMPTY);
  let query = "";
  const champ = () => data.champions.find((c) => c.alias === build.champion) || data.champions[0];
  const isRanged = () => build.opts.ranged ?? champ().range >= window.SpeedCalc.RANGED_FROM;

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

  // Short label for an effect's value, e.g. "+20", "+45%", "+10 per stack".
  function effectText(e) {
    const v = e.byLevel ? e.byLevel[17] : e.value;
    const s = e.kind === "flat" ? `+${fmt(v, 1)}` : `+${fmt(v * 100, 1)}%`;
    if (e.opt && e.opt.type === "number") return e.base ? `+${fmt(e.base * 100)}%, ${s} each` : `${s} each`;
    return s;
  }

  function itemSub(it) {
    const parts = [];
    if (it.flat) parts.push(`${fmt(it.flat)} speed`);
    if (it.pct) parts.push(`${pct(it.pct)}`);
    for (const e of it.effects) parts.push(effectText(e));
    return parts.join(" · ");
  }

  function augSub(a) {
    return `${a.tier} · ${a.effects.map(effectText).join(" · ")}`;
  }

  function renderChamps() {
    const q = query.trim().toLowerCase();
    const matches = data.champions.filter((c) => !q || c.name.toLowerCase().includes(q));
    const shown = matches.filter((c) => c.alias !== build.champion).slice(0, SHOWN_CHAMPS - 1);
    if (!q || champ().name.toLowerCase().includes(q)) shown.unshift(champ());
    $("champ-count").textContent = matches.length > SHOWN_CHAMPS ? `${matches.length} champions, search to find more` : "";
    $("champ-picker").replaceChildren(...shown.map((c) => pickButton(c, `${fmt(c.ms)} speed · ${c.range >= window.SpeedCalc.RANGED_FROM ? "ranged" : "melee"}`, {
      on: c.alias === build.champion, click: () => { build.champion = c.alias; delete build.opts.ranged; update(); },
    })));
  }

  function optionRow(o) {
    const val = build.opts[o.key] ?? o.def;
    const input = o.type === "check"
      ? el("input", { type: "checkbox", checked: !!val })
      : el("input", { type: "number", min: 0, max: o.max, step: o.step || 1, value: val, inputmode: "decimal" });
    input.addEventListener("input", () => {
      build.opts[o.key] = o.type === "check" ? input.checked : Math.max(0, Math.min(o.max ?? 1e6, +input.value || 0));
      update(false);
    });
    return el("label", {}, o.label, input);
  }

  function renderControls() {
    renderChamps();
    $("item-slots").replaceChildren(...slots(build.items, MAX_ITEMS, itemById, (i) => { build.items.splice(i, 1); update(); }));
    $("aug-slots").replaceChildren(...slots(build.augments, MAX_AUGS, augByKey, (i) => { build.augments.splice(i, 1); update(); }));
    $("item-picker").replaceChildren(...data.items.map((it) => pickButton(it, itemSub(it), {
      on: build.items.includes(it.id), disabled: !build.items.includes(it.id) && !canAddItem(it),
      click: () => {
        if (build.items.includes(it.id)) build.items = build.items.filter((id) => id !== it.id);
        else if (canAddItem(it)) build.items.push(it.id);
        update();
      },
    })));
    $("aug-picker").replaceChildren(...data.augments.map((a) => {
      const on = build.augments.includes(a.key);
      return pickButton(a, augSub(a), {
        on, disabled: !on && build.augments.length >= MAX_AUGS,
        click: () => { build.augments = on ? build.augments.filter((k) => k !== a.key) : [...build.augments, a.key]; update(); },
      });
    }));

    const owners = [...build.items.map(itemById), ...build.augments.map(augByKey)].filter(Boolean);
    const opts = owners.flatMap((o) => o.effects.filter((e) => e.opt).map((e) => e.opt));
    const rangedRow = optionRow({ key: "ranged", label: "Ranged champion (some bonuses are smaller)", type: "check", def: isRanged() });
    $("options").replaceChildren(...opts.map(optionRow), rangedRow, ...BASE_OPTIONS.map(optionRow));
  }

  function renderResult(r) {
    $("champ-icon").src = r.champion.icon;
    $("speed").textContent = fmt(r.final);
    $("raw").textContent = fmt(r.raw);
    const kept = r.raw > 0 ? r.final / r.raw : 1;
    $("gain-bar").style.width = pct(Math.min(1, kept), 2);
    $("gain-bar").classList.toggle("full", kept >= 0.999);
    $("cap-note").textContent = r.raw <= CAPS[0].at
      ? `Under ${CAPS[0].at}, so the soft caps take nothing. The bar shows how much of your raw speed you keep.`
      : `You keep ${pct(kept)} of your raw speed. Above ${CAPS[0].at} only 80% of the extra counts, above ${CAPS[1].at} only half.`;
    drawChart(r);

    const lane = Math.max(1, +(build.opts.lane ?? 10000) || 10000);
    const stats = [
      ["Soft caps ate", fmt(r.eaten)],
      ["Cross the lane", `${fmt(lane / r.final, 1)} s`],
      ["Average base speed", `${fmt(r.final / AVG_BASE, 1)}×`],
      [`${r.champion.name} base`, `${fmt(r.champion.ms)}, faster than ${pct(fasterThan(data, r.champion.ms))}`],
    ];
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));
    $("compare").textContent = `At ${fmt(r.final)} you cross a ${fmt(lane)} unit lane in ${fmt(lane / r.final, 1)} seconds, against ${fmt(lane / r.champion.ms, 1)} seconds on base speed. `
      + `That is ${fmt(r.final / AVG_BASE, 1)} times the average champion's base speed of ${fmt(AVG_BASE)}.`;

    const kinds = { flat: "Flat", pct: "Percent", mult: "Multiplier" };
    const val = (s) => (s.kind === "flat" ? `+${fmt(s.value, 1)}` : `+${fmt(s.value * 100, 1)}%`);
    const rows = [el("tr", {}, el("td", {}, `${r.champion.name} base speed`), el("td", {}, "Base"), el("td", {}, fmt(r.champion.ms)))];
    rows.push(...r.sources.map((s) => el("tr", s.on ? {} : { class: "muted" },
      el("td", {}, s.label), el("td", {}, kinds[s.kind]), el("td", {}, s.on ? val(s) : "off"))));
    const sum = (label, kind, v) => el("tr", {}, el("th", {}, label), el("th", {}, kind), el("th", {}, v));
    rows.push(sum("Base plus flat", "", fmt(r.champion.ms + r.flat)));
    rows.push(sum("Times bonus %", "", `×${fmt(1 + r.pct, 2)}`));
    if (r.mult !== 1) rows.push(sum("Times multipliers", "", `×${fmt(r.mult, 2)}`));
    rows.push(sum("Raw speed", "", fmt(r.raw)));
    rows.push(sum("After soft caps", "", fmt(r.final)));
    $("breakdown").replaceChildren(el("tr", {}, el("th", {}, "Source"), el("th", {}, "Type"), el("th", {}, "Speed")), ...rows);
  }

  // Final speed against raw speed, so the bend at 415 and 490 shows. The dot is this build.
  function drawChart(r) {
    const svg = $("chart");
    const maxX = Math.max(700, r.raw * 1.08);
    const x = (v) => (v / maxX) * 300;
    const y = (v) => 78 - (v / maxX) * 72;
    const n = 60, pts = [];
    for (let i = 0; i <= n; i++) pts.push([(maxX * i) / n, capped((maxX * i) / n)]);
    for (const c of CAPS) pts.push([c.at, capped(c.at)]);
    pts.sort((a, b) => a[0] - b[0]);
    const line = pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const kids = [
      mk("line", { class: "cap", x1: 0, y1: y(0), x2: 300, y2: y(maxX) }),
      ...CAPS.map((c) => mk("line", { class: "cap", x1: x(c.at), x2: x(c.at), y1: 0, y2: 80 })),
      mk("path", { class: "area", d: `${line}L300,80L0,80Z` }),
      mk("path", { class: "line", d: line }),
      mk("line", { class: "here", x1: x(r.raw), x2: x(r.raw), y1: y(r.final), y2: 80 }),
    ];
    svg.replaceChildren(...kids);
    svg.setAttribute("aria-label", `Final speed against raw speed. Raw ${fmt(r.raw)} becomes ${fmt(r.final)}.`);
  }

  function update(rerender = true) {
    if (rerender) renderControls();
    renderResult(compute(data, build));
    save();
  }

  function save() {
    const h = [build.champion, build.items.join("."), build.augments.join("."), encodeURIComponent(JSON.stringify(build.opts))].join("~");
    try { history.replaceState(null, "", `#${h}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const [ch, items, augs, opts] = decodeURIComponent(location.hash.slice(1)).split("~");
      if (!ch) return null;
      return {
        champion: data.champions.some((c) => c.alias === ch) ? ch : EMPTY.champion,
        items: (items ? items.split(".").map(Number) : []).filter((id) => itemById(id)).slice(0, MAX_ITEMS),
        augments: (augs ? augs.split(".") : []).filter((k) => augByKey(k)).slice(0, MAX_AUGS),
        opts: opts ? JSON.parse(opts) : {},
      };
    } catch {
      return null;
    }
  }

  $("patch").textContent = `Patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
  $("champ-search").addEventListener("input", (e) => { query = e.target.value; renderChamps(); });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); query = ""; $("champ-search").value = ""; update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
