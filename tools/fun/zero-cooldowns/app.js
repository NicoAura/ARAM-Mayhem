(function () {
  "use strict";
  const data = window.COOLDOWN_DATA;
  const { compute } = window.CooldownCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
  const pct = (n, d = 0) => `${fmt(n * 100, d)}%`;
  const secs = (n) => (n === null ? "–" : `${fmt(n, n < 10 ? 2 : 1)}s`);

  const MAX_ITEMS = 6, MAX_AUGS = 4, SHOWN_CHAMPS = 24;
  // Lowest Q cooldown found: Ezreal's Mystic Shot every 0.69 seconds.
  const PRESET = {
    champion: "Ezreal",
    items: [3158, 4629, 4628, 3003, 6617, 3118],
    augments: ["ARAM_Recursion", "InfiniteRecursion", "ARAM_BreadAndButter", "ARAM_Eureka"],
    opts: { ap: 600, takedowns: 10 },
  };
  const EMPTY = { champion: "Ezreal", items: [], augments: [], opts: {} };

  const OPTIONS = [
    { key: "takedowns", label: "Infinite Recursion takedowns", aug: "InfiniteRecursion", type: "number", def: 10 },
    { key: "madTiny", label: "Mad Scientist: tiny form", aug: "ARAM_MadScientist", type: "check", def: true },
    { key: "ap", label: "Ability Power (Eureka)", aug: "ARAM_Eureka", type: "number", def: 500, step: 10 },
    { key: "crit", label: "Crit chance % (Crit 'n Cast)", aug: "CritNCast", type: "number", def: 100, max: 100, step: 5 },
    { key: "as", label: "Bonus attack speed % (Purist)", aug: "ARAM_Purist_Caster", type: "number", def: 50, step: 5 },
    { key: "shrink", label: "Shrink Engine stacks", aug: "ShrinkEngine", type: "number", def: 5 },
    { key: "awakened", label: "During Ultimate Awakening's buff", aug: "UltimateAwakening", type: "check", def: false },
    { key: "inZone", label: "Standing in Surge Field", aug: "SurgeField", type: "check", def: false },
    { key: "otherHaste", label: "Other Ability Haste (runes, passives)", type: "number", def: 0, step: 5 },
  ];

  let build = load() || structuredClone(EMPTY);
  let query = "";
  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  const champ = () => data.champions.find((c) => c.alias === build.champion) || data.champions[0];

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
    const parts = [];
    if (it.haste) parts.push(`${fmt(it.haste)} haste`);
    if (it.values.UltimateHaste) parts.push(`+${fmt(it.values.UltimateHaste)} Ultimate`);
    if (it.values.AHBase) parts.push(`+${fmt(it.values.AHBase)} basic abilities`);
    return parts.join(" · ");
  }

  function renderChamps() {
    const q = query.trim().toLowerCase();
    const matches = data.champions.filter((c) => !q || c.name.toLowerCase().includes(q));
    const shown = matches.filter((c) => c.alias !== build.champion).slice(0, SHOWN_CHAMPS - 1);
    shown.unshift(champ());
    $("champ-count").textContent = matches.length > SHOWN_CHAMPS ? `${matches.length} champions, search to find more` : "";
    $("champ-picker").replaceChildren(...shown.map((c) => pickButton(c, c.spells.map((s) => `${s.key} ${fmt(s.cd[0], 1)}`).join(" · "), {
      on: c.alias === build.champion, click: () => { build.champion = c.alias; update(); },
    })));
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
        build.opts[o.key] = o.type === "check" ? input.checked : Math.max(0, Math.min(o.max ?? 1e5, +input.value || 0));
        update(false);
      });
      return el("label", {}, o.label, input);
    });
    if (build.augments.includes("ARAM_Dashing")) {
      for (const s of champ().spells) {
        const input = el("input", { type: "checkbox", checked: (build.opts.dash || []).includes(s.key) });
        input.addEventListener("input", () => {
          const set = new Set(build.opts.dash || []);
          input.checked ? set.add(s.key) : set.delete(s.key);
          build.opts.dash = [...set];
          update(false);
        });
        rows.push(el("label", {}, `Dashing: ${s.key} · ${s.name} is a dash`, input));
      }
    }
    $("options").replaceChildren(...rows);
  }

  function renderResult(r) {
    $("champ-icon").src = r.champion.icon;
    $("haste").textContent = fmt(r.haste);
    $("reduction").textContent = pct(r.reduction, 1);
    $("gain-bar").style.width = pct(Math.min(1, r.reduction), 2);
    $("reduction-note").textContent = r.ultBot
      ? "Ult Bot: haste only works on your Ultimate, and 50% better there."
      : `Each point of haste counts a little less: 100 haste cuts cooldowns by 50%, 300 by 75% and 900 by 90%.${r.cdr ? " Purist adds 10% on top." : ""}`;

    const live = r.abilities.filter((a) => a.cd);
    const fastest = live.reduce((m, a) => (!m || a.cd < m.cd ? a : m), null);
    const ult = r.abilities.find((a) => a.key === "R");
    const stats = [
      ["Fastest ability", fastest ? `${fastest.key} every ${secs(fastest.cd)}` : "–"],
      ["Casts per minute", fmt(r.castsPerMinute)],
      ["Ultimate", ult && ult.sealed ? "sealed" : secs(ult && ult.cd)],
      ["Haste on Ultimate", ult ? fmt(ult.haste) : "–"],
    ];
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    const head = el("tr", {}, ...["Ability", "Base", "Haste", "Cooldown", "Per minute"].map((h) => el("th", {}, h)));
    $("abilities").replaceChildren(head, ...r.abilities.map((a) => el("tr", {},
      el("td", {}, `${a.key} · ${a.name}`), el("td", {}, a.base ? secs(a.base) : "none listed"), el("td", {}, fmt(a.haste)),
      el("td", {}, a.sealed ? "sealed" : a.base ? secs(a.cd) : "–"), el("td", {}, a.perMinute ? fmt(a.perMinute, 1) : "–"))));

    const scopes = { all: "All abilities", R: "Ultimate", basic: "Q, W and E", Q: "Q", W: "W", E: "E" };
    const rows = r.sources.map((s) => el("tr", {}, el("td", {}, s.label), el("td", {}, scopes[s.scope]), el("td", {}, `+${fmt(s.value)}`)));
    if (r.cdr) rows.push(el("tr", {}, el("td", {}, "Purist - Caster"), el("td", {}, scopes.all), el("td", {}, "10% CDR")));
    $("breakdown").replaceChildren(el("tr", {}, el("th", {}, "Source"), el("th", {}, "Applies to"), el("th", {}, "Haste")),
      ...(rows.length ? rows : [el("tr", {}, el("td", { colspan: 3, class: "muted" }, "Pick items and augments to add haste."))]));
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

  $("patch").textContent = `Game data: patch ${data.patch.split(".").slice(0, 2).join(".")}.`;
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
