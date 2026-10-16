(function () {
  "use strict";
  const data = window.HEARTSTEEL_DATA;
  const { compute, HEARTSTEEL } = window.HeartsteelCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "∞");
  const pct = (n, d = 0) => `${fmt(n * 100, d)}%`;

  const MAX_ITEMS = 6, MAX_AUGS = 4;
  // Highest Health after 60 procs at level 18, from trying every combination (see README).
  const PRESET = {
    champion: "Galio", level: 18,
    items: [HEARTSTEEL, 3083, 6664, 3065, 3748, 2501],
    augments: ["ARAM_Goliath", "ARAM_TankEngine", "ARAM_CelestialBody", "ARAM_DrawYourSword"],
    opts: {},
  };
  const EMPTY = { champion: "Sion", level: 18, items: [HEARTSTEEL], augments: [], opts: {} };

  const OPTIONS = [
    { key: "procs", label: "Heartsteel procs", type: "number", def: 60, max: 2000 },
    { key: "procsPerMinute", label: "Procs per minute (for time)", type: "number", def: 2, max: 20, step: 0.5 },
    { key: "tankStacks", label: "Tank Engine stacks", aug: "ARAM_TankEngine", type: "number", def: 10 },
    { key: "soulStacks", label: "Soul Eater stacks", aug: "SoulEater", type: "number", def: 15 },
    { key: "madLarge", label: "Mad Scientist: large form", aug: "ARAM_MadScientist", type: "check", def: true },
    { key: "otherHP", label: "Other Health (Cho'Gath R, Sion W, anvils)", type: "number", def: 0, step: 50 },
  ];

  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  let build = load() || structuredClone(EMPTY);

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

  function slots(list, max, toThing, remove, locked = () => false) {
    const out = [];
    for (let i = 0; i < max; i++) {
      const t = list[i] !== undefined ? toThing(list[i]) : null;
      out.push(t
        ? el("button", { class: "slot filled", title: locked(i) ? t.name : `Remove ${t.name}`, "aria-label": locked(i) ? t.name : `Remove ${t.name}`, disabled: locked(i), on: () => remove(i) }, el("img", { src: t.icon, alt: "" }))
        : el("button", { class: "slot", disabled: true, "aria-label": "Empty slot" }));
    }
    return out;
  }

  function renderControls() {
    $("champ-picker").replaceChildren(...data.champions.map((c) => pickButton(c, `${fmt(c.baseHP)} + ${fmt(c.hpPerLevel)}/level`, {
      on: c.alias === build.champion, click: () => { build.champion = c.alias; update(); },
    })));
    $("item-slots").replaceChildren(...slots(build.items, MAX_ITEMS, itemById, (i) => { build.items.splice(i, 1); update(); }, (i) => i === 0));
    $("aug-slots").replaceChildren(...slots(build.augments, MAX_AUGS, augByKey, (i) => { build.augments.splice(i, 1); update(); }));
    $("item-picker").replaceChildren(...data.items.filter((it) => it.id !== HEARTSTEEL).map((it) => pickButton(it, `${fmt(it.hp)} Health${it.values.HPAmp ? ` · +${pct(it.values.HPAmp)}` : ""}`, {
      on: build.items.includes(it.id), disabled: !build.items.includes(it.id) && !canAddItem(it),
      click: () => {
        if (build.items.includes(it.id)) build.items = build.items.filter((id) => id !== it.id);
        else if (canAddItem(it)) build.items.push(it.id);
        update();
      },
    })));
    $("aug-picker").replaceChildren(...data.augments.map((a) => {
      const on = build.augments.includes(a.key);
      return pickButton(a, a.tier, {
        on, disabled: !on && build.augments.length >= MAX_AUGS,
        click: () => { build.augments = on ? build.augments.filter((k) => k !== a.key) : [...build.augments, a.key]; update(); },
      });
    }));

    const rows = OPTIONS.filter((o) => !o.aug || build.augments.includes(o.aug)).map((o) => {
      const val = build.opts[o.key] ?? o.def;
      const input = o.type === "check"
        ? el("input", { type: "checkbox", checked: !!val })
        : el("input", { type: "number", min: 0, max: o.max, step: o.step || 1, value: val, inputmode: "decimal" });
      input.addEventListener("input", () => {
        build.opts[o.key] = o.type === "check" ? input.checked : Math.max(0, Math.min(o.max ?? 1e6, +input.value || 0));
        update(false);
      });
      return el("label", {}, o.label, input);
    });
    $("options").replaceChildren(...rows);
  }

  function renderResult(r) {
    $("champ-icon").src = r.champion.icon;
    $("procs-label").textContent = fmt(r.procs);
    $("hp").textContent = fmt(r.finalHP);
    $("growth").textContent = pct(r.growthPerProc, 2);
    const ppm = build.opts.procsPerMinute ?? 2;
    const t = (n) => {
      if (n === null) return null;
      if (n === 0) return "from the start";
      const p = `${fmt(n)} ${n === 1 ? "proc" : "procs"}`;
      return ppm > 0 ? `${p} (about ${fmt(n / ppm)} min)` : p;
    };
    $("growth-note").textContent = r.questThreshold
      ? (r.questProc ? `Steel Your Heart triggered on proc ${r.questProc} and tripled the stacks.` : `Steel Your Heart triggers at ${fmt(r.questThreshold)} stacks; not reached yet.`)
      : "Once Heartsteel stacks make up most of your Health, each proc adds this much more.";

    drawChart(r);
    const stats = [
      ["Starting Health", fmt(r.startHP)], ["Heartsteel stacks", fmt(r.stacks)],
      ["Last proc damage", fmt(r.finalProc)], ["Health multiplier", `×${fmt(r.mult, 2)}`],
    ];
    for (const m of Object.keys(r.milestones)) stats.push([`${fmt(+m)} Health`, t(r.milestones[m]) || "not in range"]);
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    const rows = [el("tr", {}, el("td", {}, `${r.champion.name} base at level ${build.level}`), el("td", {}, fmt(r.baseHP)))];
    rows.push(...r.sources.map((s) => el("tr", {}, el("td", {}, s.label), el("td", {}, s.kind === "amp" ? `+${pct(s.value)} Health` : `+${fmt(s.value)}`))));
    rows.push(el("tr", {}, el("td", {}, `Heartsteel stacks after ${fmt(r.procs)} procs`), el("td", {}, `+${fmt(r.stacks)}`)));
    $("breakdown").replaceChildren(el("tr", {}, el("th", {}, "Source"), el("th", {}, "Health")), ...rows);
  }

  function drawChart(r) {
    const svg = $("chart"), pts = r.series;
    const max = Math.max(...pts);
    if (pts.length < 2 || !max) { svg.replaceChildren(); return; }
    const x = (i) => (i / (pts.length - 1)) * 300;
    const y = (v) => 78 - (v / max) * 72;
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const kids = [mk("path", { class: "area", d: `${line}L300,80L0,80Z` }), mk("path", { class: "line", d: line })];
    if (r.questProc) kids.unshift(mk("line", { class: "cap", x1: x(r.questProc), x2: x(r.questProc), y1: 0, y2: 80 }));
    svg.replaceChildren(...kids);
    svg.setAttribute("aria-label", `Max Health over ${pts.length - 1} procs, ending at ${fmt(r.finalHP)}`);
  }

  function update(rerender = true) {
    if (build.items[0] !== HEARTSTEEL) build.items = [HEARTSTEEL, ...build.items.filter((id) => id !== HEARTSTEEL)].slice(0, MAX_ITEMS);
    if (rerender) renderControls();
    $("level-out").textContent = build.level;
    $("level").value = build.level;
    renderResult(compute(data, build));
    save();
  }

  function save() {
    const h = [build.champion, build.level, build.items.join("."), build.augments.join("."), encodeURIComponent(JSON.stringify(build.opts))].join("~");
    try { history.replaceState(null, "", `#${h}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const [champ, lvl, items, augs, opts] = decodeURIComponent(location.hash.slice(1)).split("~");
      if (!champ) return null;
      return {
        champion: data.champions.some((c) => c.alias === champ) ? champ : EMPTY.champion,
        level: Math.min(18, Math.max(1, +lvl || 18)),
        items: (items ? items.split(".").map(Number) : []).filter((id) => itemById(id)).slice(0, MAX_ITEMS),
        augments: (augs ? augs.split(".") : []).filter((k) => augByKey(k)).slice(0, MAX_AUGS),
        opts: opts ? JSON.parse(opts) : {},
      };
    } catch {
      return null;
    }
  }

  $("patch").textContent = `Patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
  $("level").addEventListener("input", (e) => { build.level = +e.target.value; update(false); });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
