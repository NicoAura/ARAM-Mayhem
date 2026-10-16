// "Change the simulation" panel: edit the build, the enemies and the fight settings,
// re-run the simulator in a Web Worker (sim-worker.js) and replay the new fight.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DUMMY_KEYS = ["fixed_target", "target_hp", "target_armor", "target_mr"];
  const isModelKey = (k) => ["dodge_chance", "reaction_time", "aim_lead"].includes(k);
  const ENEMY_STATS = [
    ["hp", "HP", 1], ["armor", "Armor", 1], ["mr", "MR", 1], ["damage_share", "Dmg share", 0.01],
  ];

  let meta = null, champ = null, trace = null, busy = false;
  let picks = null; // [{id, stats:{hp, armor, mr, damage_share}}]
  const combos = {};  // champion id -> combo the user typed
  const enemyById = new Map();

  // ---------- worker ----------
  let worker = null;
  const pending = new Map();
  let nextId = 1;
  function call(args) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage({ id, args });
    });
  }
  function status(text, kind) {
    const el = $("simStatus");
    el.textContent = text;
    el.className = "sim-status" + (kind ? " " + kind : "");
  }
  try {
    worker = new Worker("sim-worker.js?v=" + (window.REPLAY_VERSION || "0"));
    worker.onmessage = (e) => { const r = pending.get(e.data.id); pending.delete(e.data.id); if (r) r(e.data); };
    worker.onerror = () => status("The simulator couldn't start in this browser. The replays above still work.", "err");
    call(["--list", "--json"]).then((r) => {
      if (!r.ok) { status("The simulator couldn't load its data: " + r.stderr, "err"); return; }
      meta = JSON.parse(r.stdout);
      for (const e of meta.enemies) enemyById.set(e.id.toLowerCase(), e);
      buildFightForm();
      for (const b of ["runBuild", "findBest", "resetAll"]) $(b).disabled = false;
      status("Change anything below, then simulate. Changed values are marked with a dot.");
      if (champ) fillFromTrace();
    });
  } catch (e) {
    status("The simulator needs Web Workers, which this browser blocks.", "err");
  }

  window.onReplayLoad = (c, tr, isCustom) => {
    const changedChamp = !champ || champ.id !== c.id;
    $("buildTitle").textContent = isCustom ? "Your simulated setup" : "Simulated best build";
    champ = c; trace = tr;
    if (meta && (changedChamp || !isCustom)) fillFromTrace();
  };

  // ---------- build ----------
  function select(options, value, label) {
    const s = document.createElement("select");
    s.setAttribute("aria-label", label);
    s.add(new Option("(empty)", ""));
    for (const o of options) s.add(new Option(o.name + (o.rarity ? " · " + rarityName(o.rarity) : ""), o.key));
    s.value = value || "";
    return s;
  }
  function rarityName(r) { return { S: "Silver", G: "Gold", P: "Prismatic" }[r] || r; }
  function fillFromTrace() {
    const box = $("buildBox");
    box.querySelectorAll(".slot-row, .sub").forEach((n) => n.remove());
    const boots = meta.items.filter((i) => i.slot === "boots").sort((a, b) => a.name.localeCompare(b.name));
    const legs = meta.items.filter((i) => i.slot !== "boots").sort((a, b) => a.name.localeCompare(b.name));
    const augs = meta.augments.slice().sort((a, b) => a.name.localeCompare(b.name));
    const items = trace.build.items.map((i) => i.key);
    const bootKey = items.find((k) => boots.some((b) => b.key === k)) || "";
    const legKeys = items.filter((k) => k !== bootKey);
    const row = (label, el) => {
      const r = document.createElement("div"); r.className = "slot-row";
      const l = document.createElement("span"); l.textContent = label;
      r.append(l, el); box.append(r);
    };
    row("B", select(boots, bootKey, "Boots"));
    for (let i = 0; i < 5; i++) row(String(i + 1), select(legs, legKeys[i], "Item " + (i + 1)));
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = "Augments"; box.append(sub);
    const augKeys = trace.build.augments.map((a) => a.key);
    for (let i = 0; i < 4; i++) row(String(i + 1), select(augs, augKeys[i], "Augment " + (i + 1)));
    // Cast order when several abilities are ready; defaults to the champion's recommended combo.
    const sub2 = document.createElement("div"); sub2.className = "sub"; sub2.textContent = "Combo (cast order)"; box.append(sub2);
    const combo = document.createElement("input");
    combo.id = "comboInput"; combo.type = "text"; combo.maxLength = 4; combo.autocomplete = "off";
    combo.setAttribute("aria-label", "Combo, for example EQRW");
    combo.value = combos[champ.id] || defaultCombo();
    combo.addEventListener("input", () => {
      combo.value = combo.value.toUpperCase().replace(/[^QWER]/g, "");
      combos[champ.id] = combo.value;
    });
    row("", combo);

    if (!picks) {
      picks = trace.fight.team.slice(0, 5).map((id) => ({ id, stats: {} }));
      const byWeight = meta.enemies.slice().sort((a, b) => b.weight - a.weight);
      for (const e of byWeight) {
        if (picks.length >= 5) break;
        if (!picks.some((p) => p.id === e.id) && e.id.toLowerCase() !== champ.id.toLowerCase()) picks.push({ id: e.id, stats: {} });
      }
    }
    // A champion never fights itself in Mayhem.
    for (const p of picks)
      if (p.id.toLowerCase() === champ.id.toLowerCase())
        p.id = meta.enemies.find((e) => !picks.some((q) => q.id === e.id) && e.id.toLowerCase() !== champ.id.toLowerCase()).id;
    renderEnemies();
  }
  function defaultCombo() {
    const c = meta.champions.find((x) => x.id === champ.id);
    return (c && c.combo) || "";
  }
  function chosenBuild() {
    const sels = [...$("buildBox").querySelectorAll("select")];
    const items = sels.slice(0, 6).map((s) => s.value).filter(Boolean);
    const augs = sels.slice(6).map((s) => s.value).filter(Boolean);
    return { items, augs };
  }

  // ---------- enemies ----------
  function enemyMode() { return document.querySelector('input[name="emode"]:checked').value; }
  for (const r of document.querySelectorAll('input[name="emode"]')) r.addEventListener("change", renderEnemies);
  function renderEnemies() {
    const box = $("enemyDetail");
    box.textContent = "";
    if (!meta) return;
    const mode = enemyMode();
    if (mode === "pool") {
      const p = document.createElement("p"); p.className = "note";
      p.textContent = "Each fight draws five enemies weighted by how often they're picked in Mayhem, with their real HP, resists and damage. This is the default.";
      box.append(p);
      return;
    }
    if (mode === "dummy") {
      for (const k of ["target_hp", "target_armor", "target_mr"]) box.append(field(meta.settings.find((s) => s.key === k)));
      return;
    }
    const pool = meta.enemies.filter((e) => e.id.toLowerCase() !== champ.id.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name));
    picks.forEach((pick, idx) => {
      const card = document.createElement("div"); card.className = "enemy";
      const s = document.createElement("select"); s.setAttribute("aria-label", "Enemy " + (idx + 1));
      for (const e of pool) s.add(new Option(e.name, e.id));
      s.value = pick.id;
      s.addEventListener("change", () => { pick.id = s.value; pick.stats = {}; renderEnemies(); });
      const grid = document.createElement("div"); grid.className = "enemy-stats";
      const base = enemyById.get(pick.id.toLowerCase()) || {};
      for (const [key, label, step] of ENEMY_STATS) {
        const l = document.createElement("label");
        l.append(label);
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = step; inp.min = 0;
        inp.value = pick.stats[key] !== undefined ? pick.stats[key] : base[key];
        const mark = () => inp.classList.toggle("changed", Math.abs(parseFloat(inp.value) - base[key]) > 1e-9);
        inp.addEventListener("input", () => {
          const v = parseFloat(inp.value);
          if (Number.isFinite(v) && Math.abs(v - base[key]) > 1e-9) pick.stats[key] = v; else delete pick.stats[key];
          mark();
        });
        mark();
        l.append(inp); grid.append(l);
      }
      card.append(s, grid); box.append(card);
    });
    const p = document.createElement("p"); p.className = "note";
    p.textContent = "Starts from each champion's real Mayhem HP, resists and share of their team's damage. Change any number to make that enemy tougher or hit harder.";
    box.append(p);
  }

  // ---------- fight settings ----------
  const fieldValues = {};
  function field(s) {
    const wrap = document.createElement("div"); wrap.className = "field";
    const id = "set_" + s.key;
    const l = document.createElement("label"); l.htmlFor = id;
    const words = s.description.charAt(0).toUpperCase() + s.description.slice(1);
    l.textContent = words;
    const inp = document.createElement("input");
    inp.type = "number"; inp.id = id;
    inp.step = Math.abs(s.default) <= 1 && s.key !== "level" ? 0.05 : s.default >= 100 ? 10 : 1;
    inp.value = fieldValues[s.key] !== undefined ? fieldValues[s.key] : s.default;
    const mark = () => wrap.classList.toggle("changed", Math.abs(parseFloat(inp.value) - s.default) > 1e-9);
    inp.addEventListener("input", () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && Math.abs(v - s.default) > 1e-9) fieldValues[s.key] = v; else delete fieldValues[s.key];
      mark();
    });
    mark();
    wrap.append(l, inp);
    return wrap;
  }
  function buildFightForm() {
    const box = $("fightBox");
    box.querySelectorAll(".field, .sub").forEach((n) => n.remove());
    for (const s of meta.settings) if (!DUMMY_KEYS.includes(s.key) && !isModelKey(s.key)) box.append(field(s));
    const sub = document.createElement("div"); sub.className = "sub"; sub.textContent = "Model assumptions"; box.append(sub);
    for (const s of meta.settings) if (isModelKey(s.key)) box.append(field(s));
  }

  // ---------- running ----------
  function args(withBuild) {
    const a = ["--champ", champ.id, "--json", "--trace", "/trace.json"];
    const set = Object.entries(fieldValues).filter(([k]) => !DUMMY_KEYS.includes(k) || enemyMode() === "dummy");
    if (enemyMode() === "dummy") set.push(["fixed_target", 1]);
    if (set.length) a.push("--set", set.map(([k, v]) => `${k}=${v}`).join(","));
    if (enemyMode() === "pick")
      a.push("--team", picks.map((p) => [p.id, ...Object.entries(p.stats).map(([k, v]) => `${k}=${v}`)].join(":")).join(","));
    const combo = $("comboInput") ? $("comboInput").value : "";
    if (combo && combo !== defaultCombo()) {
      if (new Set(combo).size !== combo.length) throw new Error("Use each of Q, W, E and R at most once in the combo.");
      a.push("--combo", combo);
    }
    if (withBuild) {
      const b = chosenBuild();
      if (!b.items.length) throw new Error("Pick at least one item.");
      a.push("--items", b.items.join(","));
      if (b.augs.length) a.push("--augs", b.augs.join(","));
    }
    return a;
  }
  async function run(withBuild) {
    if (busy || !meta) return;
    let a;
    try { a = args(withBuild); } catch (e) { status(e.message, "err"); return; }
    busy = true;
    for (const b of ["runBuild", "findBest", "resetAll"]) $(b).disabled = true;
    status(withBuild ? "Simulating 2,000 fights…" : "Searching item and augment builds. This takes a few seconds…", "busy");
    const t0 = performance.now();
    const r = await call(a);
    busy = false;
    for (const b of ["runBuild", "findBest", "resetAll"]) $(b).disabled = false;
    if (!r.ok || !r.trace) {
      status((r.stderr || "The simulation failed.").replace(/^error:\s*/, ""), "err");
      return;
    }
    const res = JSON.parse(r.stdout);
    const tr = JSON.parse(r.trace);
    const best = res.builds[0].summary;
    const def = window.ReplayViewer.defaultTrace().summary.mean_dps;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status(`Done in ${secs} s. Average DPS ${Math.round(best.mean_dps).toLocaleString()} ` +
      `(±${Math.round(best.ci95)}), survives ${Math.round(best.survival_rate * 100)}% of fights. ` +
      `The default setup averaged ${Math.round(def).toLocaleString()}. The replay above now shows a typical fight with these settings.`);
    showAlternatives(withBuild ? [] : res.builds);
    window.ReplayViewer.showTrace(tr);
    trace = tr;
    fillFromTrace();
  }
  function showAlternatives(builds) {
    const box = $("alts");
    box.textContent = "";
    box.hidden = builds.length < 2;
    if (builds.length < 2) return;
    const h = document.createElement("div"); h.className = "sub"; h.textContent = "Other strong builds (click to load into the build slots)";
    box.append(h);
    const name = (k, list) => (list.find((x) => x.key === k) || { name: k }).name;
    builds.slice(1).forEach((b) => {
      const btn = document.createElement("button"); btn.type = "button";
      const dps = document.createElement("b"); dps.textContent = Math.round(b.summary.mean_dps).toLocaleString();
      const txt = document.createElement("span");
      txt.textContent = b.build.items.map((k) => name(k, meta.items)).join(", ") + " | " + b.build.augments.map((k) => name(k, meta.augments)).join(", ");
      btn.append(dps, txt);
      btn.addEventListener("click", () => {
        trace = { build: { items: b.build.items.map((key) => ({ key })), augments: b.build.augments.map((key) => ({ key })) }, fight: trace.fight };
        fillFromTrace();
        run(true);
      });
      box.append(btn);
    });
  }

  $("runBuild").addEventListener("click", () => run(true));
  $("findBest").addEventListener("click", () => run(false));
  $("resetAll").addEventListener("click", () => {
    for (const k of Object.keys(fieldValues)) delete fieldValues[k];
    for (const k of Object.keys(combos)) delete combos[k];
    $("emodePool").checked = true;
    picks = null;
    $("alts").hidden = true;
    buildFightForm();
    window.ReplayViewer.resetTrace();
    status("Back to the default build, enemies and fight settings.");
  });
})();
