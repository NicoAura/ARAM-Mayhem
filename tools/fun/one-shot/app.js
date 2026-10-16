(function () {
  "use strict";
  const data = window.ONESHOT_DATA;
  const { compute, TARGETS, DEFAULTS, TYPES } = window.OneShotCalc;
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => (isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "∞");
  const pct = (n, d = 0) => `${fmt(n * 100, d)}%`;

  const MAX_ITEMS = 6, MAX_AUGS = 4, SHOWN_CHAMPS = 24;
  const TYPE_LABEL = { physical: "Physical", magic: "Magic", true: "True" };
  // A 3,200 physical damage assassin combo into a level 18 Sion with a full tank build: 38% of his
  // Health with these items alone, a kill once the four augments are added.
  const PRESET = {
    champion: "Sion", level: 18, target: "tank", bonus: { hp: TARGETS.tank.hp, ar: TARGETS.tank.ar, mr: TARGETS.tank.mr },
    raw: { physical: 3200, magic: 0, true: 0 },
    items: [3142, 2520, 6697, 6694, 6676, 3814],
    augments: ["ARAM_ThreadtheNeedle", "ARAM_Erosion", "GlassCannon", "ARAM_GiantSlayer"],
    opts: {},
  };
  const EMPTY = {
    champion: "Malphite", level: 18, target: "none", bonus: { hp: 0, ar: 0, mr: 0 },
    raw: { physical: 1500, magic: 0, true: 0 }, items: [], augments: [], opts: {},
  };

  const giant = data.augments.find((a) => a.key === "ARAM_GiantSlayer");
  const OPTIONS = [
    { key: "cleaverStacks", label: "Black Cleaver stacks", item: 3071, type: "number", max: 5 },
    { key: "abyssal", label: "Target is near you (Abyssal Mask)", item: 8020, type: "check" },
    { key: "riftmaker", label: "In combat for 4 seconds (Riftmaker)", item: 4633, type: "check" },
    { key: "liandry", label: "In combat for 3 seconds (Liandry's)", item: 6653, type: "check" },
    { key: "shojinStacks", label: "Spear of Shojin stacks", item: 3161, type: "number", max: 4 },
    { key: "erosionStacks", label: "Erosion stacks", aug: "ARAM_Erosion", type: "number", max: 20 },
    { key: "teeth", label: "Tooth Fairy teeth collected", aug: "BurstingTeeth", type: "number", max: 1000 },
    {
      key: "giant", label: "Giant Slayer: target size", aug: "ARAM_GiantSlayer", type: "select",
      choices: giant ? [["small", "A little", giant.values.SmallBonusDamage], ["medium", "Bigger", giant.values.MedBonusDamage],
        ["large", "Much bigger", giant.values.LargeBonusDamage], ["xlarge", "Huge", giant.values.XLargeBonusDamage]] : [],
    },
    { key: "brush", label: "Attacking from Brush (Hide on Bush)", aug: "BrushPower", type: "check" },
    { key: "firstStrike", label: "You start the fight (First Strike)", aug: "ARAM_FromBeginningToEnd", type: "check" },
    { key: "mana", label: "Your max Mana (Overflow)", aug: "ARAM_Overflow", type: "number", step: 100 },
    { key: "msDiff", label: "Move Speed above the target (Don't Blink)", aug: "ARAM_DontBlink", type: "number", step: 10 },
    { key: "dropkick", label: "Dropkick execute % (4% plus some from your stats)", aug: "ARAM_Dropkick", type: "number", max: 100, step: 0.5 },
    { key: "ranged", label: "You are ranged", any: ["GlassCannon", 2520], type: "check" },
    { key: "abilities", label: "The burst is all ability damage", any: ["ARAM_BacktoBasics", "ARAM_Overflow", 3161, 2520], type: "check" },
  ];

  // Defined before load() runs, which needs them.
  const itemById = (id) => data.items.find((i) => i.id === id);
  const augByKey = (k) => data.augments.find((a) => a.key === k);
  let build = load() || structuredClone(EMPTY);
  let query = "";
  const champ = () => data.champions.find((c) => c.alias === build.champion) || data.champions[0];
  const has = (x) => (typeof x === "number" ? build.items.includes(x) : build.augments.includes(x));
  const shown = (o) => (o.item ? has(o.item) : o.aug ? has(o.aug) : o.any ? o.any.some(has) : true);

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
      ...(thing.icon ? [el("img", { src: thing.icon, alt: "", loading: "lazy" })] : []), el("span", {}, thing.name, el("span", { class: "tier" }, sub)));
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

  function numberInput(value, set, { min = 0, max, step = 1 } = {}) {
    const input = el("input", { type: "number", min, max, step, value, inputmode: "decimal" });
    input.addEventListener("input", () => { set(Math.max(min, Math.min(max ?? 1e6, +input.value || 0))); update(false); });
    return input;
  }

  function itemSub(it) {
    const v = it.values, parts = [];
    if (it.lethality) parts.push(`${fmt(it.lethality)} Lethality`);
    if (it.armorPen) parts.push(`${pct(it.armorPen)} Armor pen`);
    if (it.magicPenFlat) parts.push(`${fmt(it.magicPenFlat)} Magic pen`);
    if (it.magicPen) parts.push(`${pct(it.magicPen)} Magic pen`);
    if (v.ShredPerStack) parts.push(`-${pct(v.ShredPerStack * v.MaxStacks)} Armor`);
    if (v.DamageAmp) parts.push(`+${pct(v.DamageAmp)} magic damage`);
    if (v.EternityDamageIncreaseMax) parts.push(`+${pct(v.EternityDamageIncreaseMax)} damage`);
    if (v.DamageIncreaseMax) parts.push(`+${pct(v.DamageIncreaseMax)} damage`);
    if (v.SpellDamageIncrease) parts.push(`+${pct(v.SpellDamageIncrease * v.StackCount)} ability damage`);
    if (v.ExecuteThreshold) parts.push(`executes below ${pct(v.ExecuteThreshold)}`);
    return parts.join(" · ");
  }

  function targetStats(c) {
    const { statAt } = window.OneShotCalc;
    const n = build.level;
    return `${fmt(statAt(c.hp, c.hpG, n))} HP · ${fmt(statAt(c.ar, c.arG, n))} AR · ${fmt(statAt(c.mr, c.mrG, n))} MR`;
  }

  function renderChamps() {
    const q = query.trim().toLowerCase();
    const matches = data.champions.filter((c) => !q || c.name.toLowerCase().includes(q));
    const shownChamps = matches.filter((c) => c.alias !== build.champion).slice(0, SHOWN_CHAMPS - 1);
    shownChamps.unshift(champ());
    $("champ-count").textContent = matches.length > SHOWN_CHAMPS ? `${matches.length} champions, search to find more` : "";
    $("champ-picker").replaceChildren(...shownChamps.map((c) => pickButton(c, targetStats(c), {
      on: c.alias === build.champion, click: () => { build.champion = c.alias; update(); },
    })));
  }

  function renderControls() {
    renderChamps();
    $("burst").replaceChildren(...TYPES.map((t) => el("label", {}, `${TYPE_LABEL[t]} damage`,
      numberInput(build.raw[t], (v) => (build.raw[t] = v), { step: 50 }))));

    $("target-picker").replaceChildren(...Object.entries(TARGETS).map(([key, t]) => pickButton({ name: t.label },
      key === "none" ? "Base stats only" : `+${fmt(t.hp)} HP${t.ar ? ` · +${t.ar} AR` : ""}${t.mr ? ` · +${t.mr} MR` : ""}`, {
        on: build.target === key,
        click: () => { build.target = key; build.bonus = { hp: t.hp, ar: t.ar, mr: t.mr }; update(); },
      })));
    const bonusRow = (key, label) => el("label", {}, label, numberInput(build.bonus[key], (v) => { build.bonus[key] = v; build.target = "custom"; markTarget(); },
      { min: key === "hp" ? 0 : -200, step: key === "hp" ? 100 : 5 }));
    $("bonus").replaceChildren(bonusRow("hp", "Bonus Health"), bonusRow("ar", "Bonus Armor"), bonusRow("mr", "Bonus Magic Resist"));

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

    const rows = OPTIONS.filter(shown).map((o) => {
      const val = build.opts[o.key] ?? DEFAULTS[o.key];
      let input;
      if (o.type === "check") {
        input = el("input", { type: "checkbox", checked: !!val });
        input.addEventListener("input", () => { build.opts[o.key] = input.checked; update(false); });
      } else if (o.type === "select") {
        input = el("select", {}, ...o.choices.map(([k, label, v]) => el("option", { value: k, selected: k === val }, `${label} (+${pct(v)})`)));
        input.addEventListener("input", () => { build.opts[o.key] = input.value; update(false); });
      } else {
        input = numberInput(val, (v) => (build.opts[o.key] = v), { max: o.max, step: o.step });
      }
      return el("label", {}, o.label, input);
    });
    $("options-section").hidden = !rows.length;
    $("options").replaceChildren(...rows);
    markTarget();
  }

  function markTarget() {
    for (const [i, b] of [...$("target-picker").children].entries()) {
      const on = Object.keys(TARGETS)[i] === build.target;
      b.className = on ? "pick on" : "pick";
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function sourceText(s) {
    switch (s.kind) {
      case "lethality": return `${fmt(s.value)} Lethality`;
      case "armorPen": return `${pct(s.value)} Armor penetration`;
      case "magicPenFlat": return `${fmt(s.value)} Magic penetration`;
      case "magicPen": return `${pct(s.value)} Magic penetration`;
      case "bothPen": return `${pct(s.value)} Armor and Magic penetration`;
      case "armorRed": return `-${pct(s.value)} Armor`;
      case "bothRed": return `-${pct(s.value, 1)} Armor and Magic Resist`;
      case "amp": return `+${pct(s.value, 1)} damage`;
      case "magicAmp": return `+${pct(s.value, 1)} magic damage`;
      case "rider": return `+${pct(s.value)} of damage dealt as true damage`;
      case "flatTrue": return `+${fmt(s.value)} true damage`;
      case "execute": return `Executes below ${pct(s.value, 1)} Health`;
      default: return "";
    }
  }

  function renderResult(r) {
    const noAugs = compute(data, { ...build, augments: [] });
    $("champ-icon").src = r.champion.icon;
    $("verdict").textContent = r.kill ? "KILL" : `${fmt(r.left)} HP left`;
    $("dealt").textContent = `${fmt(r.total)} damage`;
    $("pct-hp").textContent = `${pct(r.share)} of max Health`;
    $("gain-bar").style.width = pct(Math.min(1, r.total / r.killAt), 2);
    $("gain-bar").classList.toggle("full", r.kill);
    const exec = r.execute ? ` ${r.executeBy} executes at ${pct(r.execute, 1)}, so ${fmt(r.killAt)} is enough.` : "";
    $("verdict-note").textContent = r.kill
      ? `${r.champion.name} has ${fmt(r.maxHP)} Health and the burst deals ${fmt(r.total)}.${exec}`
      : `To finish ${r.champion.name}, add any one of: ${fmt(Math.ceil(r.need.physical))} raw physical, ${fmt(Math.ceil(r.need.magic))} raw magic or ${fmt(Math.ceil(r.need.true))} raw true damage.${exec}`;

    const stats = [
      [`${r.champion.name} max Health`, fmt(r.maxHP)],
      ["Armor after penetration", `${fmt(r.armor)} → ${fmt(r.effArmor)}`],
      ["Magic Resist after penetration", `${fmt(r.mr)} → ${fmt(r.effMR)}`],
      ["Without augments", noAugs.kill ? "KILL" : `${pct(noAugs.share)} of Health`],
    ];
    $("stats").replaceChildren(...stats.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))));

    const head = el("tr", {}, ...["Damage", "Raw", "Multiplier", "Dealt"].map((h) => el("th", {}, h)));
    const rows = TYPES.map((t) => el("tr", {}, el("td", {}, TYPE_LABEL[t]), el("td", {}, fmt(r.raw[t])),
      el("td", {}, `×${fmt(r.factor[t], 2)}`), el("td", {}, fmt(r.dealt[t] - (t === "true" ? r.charge * r.factor.true : 0)))));
    if (r.charge) rows.push(el("tr", {}, el("td", {}, "Bastionbreaker (true)"), el("td", {}, fmt(r.charge)), el("td", {}, `×${fmt(r.factor.true, 2)}`), el("td", {}, fmt(r.charge * r.factor.true))));
    for (const d of r.riderDamage) rows.push(el("tr", {}, el("td", {}, `${d.label} (true)`), el("td", {}, "–"), el("td", {}, "–"), el("td", {}, fmt(d.value))));
    rows.push(el("tr", {}, el("th", {}, "Total"), el("th", {}, ""), el("th", {}, ""), el("th", {}, fmt(r.total))));
    $("damage").replaceChildren(head, ...rows);

    const src = r.sources.map((s) => el("tr", {}, el("td", {}, s.label), el("td", {}, sourceText(s))));
    $("breakdown").replaceChildren(el("tr", {}, el("th", {}, "Source"), el("th", {}, "Effect")),
      ...(src.length ? src : [el("tr", {}, el("td", { colspan: 2, class: "muted" }, "Pick items and augments to cut through resists."))]));
  }

  function update(rerender = true) {
    if (rerender) renderControls();
    $("level-out").textContent = build.level;
    $("level").value = build.level;
    if (!rerender) renderChamps();
    renderResult(compute(data, build));
    save();
  }

  function save() {
    const b = build.bonus, r = build.raw;
    const h = [build.champion, build.level, build.target, [b.hp, b.ar, b.mr].join("."), [r.physical, r.magic, r.true].join("."),
      build.items.join("."), build.augments.join("."), encodeURIComponent(JSON.stringify(build.opts))].join("~");
    try { history.replaceState(null, "", `#${h}`); } catch { /* embedded pages may not own the URL */ }
  }

  function load() {
    try {
      const [ch, lvl, target, bonus, raw, items, augs, opts] = decodeURIComponent(location.hash.slice(1)).split("~");
      if (!ch) return null;
      const nums = (s) => (s || "").split(".").map((x) => +x || 0);
      const [hp, ar, mr] = nums(bonus), [physical, magic, tru] = nums(raw);
      return {
        champion: data.champions.some((c) => c.alias === ch) ? ch : EMPTY.champion,
        level: Math.min(18, Math.max(1, +lvl || 18)),
        target: TARGETS[target] ? target : "custom",
        bonus: { hp: Math.max(0, hp), ar, mr }, raw: { physical, magic, true: tru },
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
  $("level").addEventListener("input", (e) => { build.level = +e.target.value; update(false); });
  $("preset").addEventListener("click", () => { build = structuredClone(PRESET); query = ""; $("champ-search").value = ""; update(); });
  $("reset").addEventListener("click", () => { build = structuredClone(EMPTY); update(); });
  $("share").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Link copied"; }
    catch { e.target.textContent = "Copy the address bar"; }
    setTimeout(() => (e.target.textContent = "Copy link"), 1500);
  });
  update();
})();
