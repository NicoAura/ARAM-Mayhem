(function () {
  "use strict";
  const data = window.SIZE_DATA;
  const { compute } = window.SizeCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });
  const pct = (n, d = 0) => `${fmt(n * 100, d)}%`;
  const signed = (n) => `${n < 0 ? "−" : "+"}${pct(Math.abs(n), 1)}`;

  const MAX_ITEMS = 6, MAX_AUGS = 4, SHOWN_CHAMPS = 24;
  // Biggest found: Nasus with R at rank 3, Heartsteel at its cap and Protoplasm Harness, plus the four
  // biggest augments, all at once. 375% size, a selection radius of 506 against Baron's 180.
  const PRESET = {
    champion: "Nasus",
    items: [3084, 2525],
    augments: ["ARAM_Goliath", "GrowthSpurt", "ARAM_TankEngine", "ARAM_MadScientist"],
    opts: { rank_NasusR: 3, maxHP: 10000, tankStacks: 10 },
  };
  const EMPTY = { champion: "Nasus", items: [], augments: [], opts: {} };

  const OPTIONS = [
    { key: "feastStacks", label: "Feast stacks", champ: "Chogath", type: "number", def: 20 },
    { key: "feastSize", label: "Size % per Feast stack (your value)", champ: "Chogath", type: "number", def: 0, step: 0.5 },
    { key: "maxHP", label: "Max Health (Heartsteel)", item: 3084, type: "number", def: 5000, step: 250 },
    { key: "lifeline", label: "Lifeline triggered", item: [2525, 3053], type: "check", def: true },
    { key: "madLarge", label: "Mad Scientist: large form", aug: "ARAM_MadScientist", type: "check", def: true },
    { key: "tankStacks", label: "Tank Engine stacks", aug: "ARAM_TankEngine", type: "number", def: 10 },
    { key: "juggLevel", label: "Titan's Resolve level (max 2)", aug: "ARAM_ImTheJuggernaut", type: "number", def: 2, max: 2 },
    { key: "spurt", label: "Growth Spurt active", aug: "GrowthSpurt", type: "check", def: true },
    { key: "realm", label: "In Dimension Shift's Realm", aug: "DimensionShift_Active", type: "check", def: true },
    { key: "shrinkStacks", label: "Shrink Engine stacks", aug: "ShrinkEngine", type: "number", def: 5, max: 20 },
    { key: "otherSize", label: "Other size % (your own value)", type: "number", def: 0, step: 5 },
  ];

  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  let build = load() || structuredClone(EMPTY);
  let query = "";
  const champ = () => data.champions.find((c) => c.alias === build.champion) || data.champions[0];
  const growthOf = (alias) => data.growth.filter((g) => g.champion === alias);

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

  function itemSub(it) {
    const v = it.values;
    return v.SizeAmount ? `+${pct(v.SizeAmount)} per ${fmt(v.HealthSizeThreshold)} Health, up to ${pct(v.SizeCap)}` : `+${pct(v.SizeIncrease)} during Lifeline`;
  }

  function augSub(a) {
    const v = a.values;
    const size = {
      ARAM_Goliath: `+${pct(v.SizeAmp)}`, ARAM_MadScientist: `+${pct(v.SizeAmp)} when large`,
      ARAM_TankEngine: `+${pct(v.SizeIncrement)} per stack`, GrowthSpurt: `+${pct(v.ScaleIncrease)} for ${v.BuffDuration} s`,
      DimensionShift_Active: `+${pct(v.SelfScaleIncrease)} for ${v.DimensionDuration} s`, ARAM_ImTheJuggernaut: `+${pct(v.SizePerLevel)} per level`,
      ShrinkEngine: `−${pct(v.SizeReductionPerStack)} per stack`, ARAM_GiantSlayer: `−${pct(v.SizeMod)}`,
    }[a.key];
    return `${a.tier} · ${size}`;
  }

  function champSub(c) {
    const g = growthOf(c.alias)[0];
    return `radius ${fmt(c.radius)}${g ? ` · R +${pct(g.ranks[g.ranks.length - 1], 1)}` : c.alias === "Chogath" ? " · Feast" : ""}`;
  }

  function renderChamps() {
    const q = query.trim().toLowerCase();
    const matches = data.champions.filter((c) => !q || c.name.toLowerCase().includes(q));
    const shown = matches.filter((c) => c.alias !== build.champion).slice(0, SHOWN_CHAMPS - 1);
    shown.unshift(champ());
    $("champ-count").textContent = matches.length > SHOWN_CHAMPS ? `${matches.length} champions, search to find more` : "";
    $("champ-picker").replaceChildren(...shown.map((c) => pickButton(c, champSub(c), {
      on: c.alias === build.champion, click: () => { build.champion = c.alias; update(); },
    })));
  }

  function numberInput(key, def, { max, step } = {}) {
    const input = el("input", { type: "number", min: 0, max, step: step || 1, value: build.opts[key] ?? def, inputmode: "decimal" });
    input.addEventListener("input", () => { build.opts[key] = Math.max(0, Math.min(max ?? 1e5, +input.value || 0)); update(false); });
    return input;
  }

  function renderControls() {
    renderChamps();
    $("item-picker").replaceChildren(...data.items.map((it) => pickButton(it, itemSub(it), {
      on: build.items.includes(it.id), disabled: !build.items.includes(it.id) && !canAddItem(it),
      click: () => {
        if (build.items.includes(it.id)) build.items = build.items.filter((id) => id !== it.id);
        else if (canAddItem(it)) build.items.push(it.id);
        update();
      },
    })));
    $("aug-slots").replaceChildren(...slots(build.augments, MAX_AUGS, augByKey, (i) => { build.augments.splice(i, 1); update(); }));
    $("aug-picker").replaceChildren(...data.augments.map((a) => {
      const on = build.augments.includes(a.key);
      return pickButton(a, augSub(a), {
        on, disabled: !on && build.augments.length >= MAX_AUGS,
        click: () => { build.augments = on ? build.augments.filter((k) => k !== a.key) : [...build.augments, a.key]; update(); },
      });
    }));

    // Ability ranks first, then whatever the picked items and augments need.
    const rows = growthOf(build.champion).map((g) => el("label", {}, `${g.label} rank (0 = off)`,
      numberInput(`rank_${g.key}`, 0, { max: g.ranks.length })));
    const has = (o) => (!o.champ || o.champ === build.champion) && (!o.aug || build.augments.includes(o.aug))
      && (!o.item || [].concat(o.item).some((id) => build.items.includes(id)));
    for (const o of OPTIONS.filter(has)) {
      if (o.type === "check") {
        const input = el("input", { type: "checkbox", checked: !!(build.opts[o.key] ?? o.def) });
        input.addEventListener("input", () => { build.opts[o.key] = input.checked; update(false); });
        rows.push(el("label", {}, o.label, input));
      } else rows.push(el("label", {}, o.label, numberInput(o.key, o.def, o)));
    }
    $("options").replaceChildren(...rows);
  }

  function renderResult(r) {
    $("champ-icon").src = r.champion.icon;
    $("size").textContent = pct(r.size);
    $("of-baron").textContent = pct(r.ofBaron);
    const bar = $("gain-bar");
    bar.style.width = pct(Math.min(1, r.ofBaron), 2);
    bar.classList.toggle("full", r.ofBaron >= 1);
    $("baron-note").textContent = r.ofBaron >= 1
      ? `${r.champion.name} is ${fmt(r.ofBaron, 2)} times as wide as Baron Nashor.`
      : `Baron Nashor is still ${fmt(1 / r.ofBaron, 2)} times as wide as ${r.champion.name}.`;
    drawSilhouette(r);

    const stats = [
      ["Selection radius", `${fmt(r.champion.radius)} → ${fmt(r.radius)}`],
      ["Collision radius", `${fmt(r.champion.collision)} → ${fmt(r.collision)}`],
      ["Baron Nashor radius", fmt(r.baron.radius)],
      ["Size without short buffs", pct(r.lasting)],
    ];
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    const rows = [el("tr", {}, el("td", {}, `${r.champion.name} normal size`), el("td", {}, "100%"))];
    rows.push(...r.sources.map((s) => el("tr", {}, el("td", {}, s.label, s.note ? el("span", { class: "muted" }, ` · ${s.note}`) : ""), el("td", {}, signed(s.value)))));
    if (r.floored) rows.push(el("tr", {}, el("td", { class: "muted" }, "Size cannot go below 20%"), el("td", {}, "")));
    rows.push(el("tr", {}, el("th", {}, "Total"), el("th", {}, pct(r.size))));
    $("breakdown").replaceChildren(el("tr", {}, el("th", {}, "Source"), el("th", {}, "Size")), ...rows);
  }

  function drawSilhouette(r) {
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (text) e.textContent = text; return e; };
    const rc = r.radius, rn = r.champion.radius, rb = r.baron.radius, gap = 40, pad = 10;
    const rl = Math.max(rc, rn); // the dashed normal-size circle can be the wider one when shrunk
    const w = 2 * rl + 2 * rb + gap + 2 * pad, ground = Math.max(rl, rb) * 2 + pad;
    const cx = pad + rl, bx = pad + 2 * rl + gap + rb;
    // Labels sit under the drawing; size them so they show at about 13px whatever the scale.
    const svg = $("silhouette");
    const box = svg.getBoundingClientRect();
    const fit = (box.width && box.height) ? Math.min(box.width / w, (box.height * 0.85) / ground) : 0.3;
    const fs = 13 / fit, label = fs * 1.4;
    svg.setAttribute("viewBox", `0 0 ${w} ${ground + label + fs * 0.4}`);
    const kids = [
      mk("line", { class: "ground", x1: 0, x2: w, y1: ground, y2: ground }),
      mk("circle", { class: "champ", cx, cy: ground - rc, r: rc }),
      mk("circle", { class: "normal", cx, cy: ground - rn, r: rn }),
      mk("circle", { class: "baron", cx: bx, cy: ground - rb, r: rb }),
      mk("text", { class: "name", x: cx, y: ground + label, "text-anchor": "middle", "font-size": fs }, `${r.champion.name} ${pct(r.size)}`),
      mk("text", { x: bx, y: ground + label, "text-anchor": "middle", "font-size": fs }, "Baron Nashor"),
    ];
    for (const c of kids) if (c.tagName !== "text" && c.tagName !== "line") c.setAttribute("vector-effect", "non-scaling-stroke");
    svg.replaceChildren(...kids);
    svg.setAttribute("aria-label", `${r.champion.name} at ${pct(r.size)} size next to Baron Nashor, drawn to scale. The dashed circle is normal size.`);
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
  window.addEventListener("resize", () => renderResult(compute(data, build)));
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
