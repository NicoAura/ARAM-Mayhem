// "Change the simulation" panel: edit the build, the enemies and the fight settings,
// re-run the simulator in a Web Worker (sim-worker.js) and replay the new fight.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const DUMMY_KEYS = ["fixed_target", "target_hp", "target_armor", "target_mr"];
  // The Fight box shows the few settings most people change; the rest sit under "Advanced settings".
  const BASIC_KEYS = ["level", "enemy_level", "enemy_damage_scale", "cc_scale", "dodge_chance"];
  const WHOLE_KEYS = ["level", "enemy_level", "until_death", "team_size", "fixed_target", "combo_order"];  // integer steps
  const ADVANCED = [
    ["Fight timing", ["until_death", "fight_cap", "fight_mean", "fight_sd", "fight_min", "fight_max", "engage_min", "engage_max",
      "retarget_delay", "r_ready_chance"]],
    ["Positions and skillshots", ["start_distance", "enemy_spread", "reaction_time", "aim_lead"]],
    ["Crowd control and casting", ["cc_min", "cc_max", "combo_order"]],
  ];
  const ENEMY_STATS = [
    ["hp", "HP", 1], ["armor", "Armor", 1], ["mr", "MR", 1], ["damage_share", "Dmg share", 0.01],
  ];

  let meta = null, champ = null, trace = null, busy = false;
  // Live patch by default; PBE runs the same model on the test server's numbers (data/pbe).
  let patch = "live";
  const patchArgs = () => (patch === "pbe" ? ["--game-data", "data/pbe"] : []);
  let picks = null; // five enemies [{id, stats:{hp, armor, mr, damage_share}, items:[], augs:[]}]; the first team_size fight
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
    loadMeta().then((ok) => { if (ok) status("Change anything below, then simulate. Changed values are marked with a dot."); });
  } catch (e) {
    status("The simulator needs Web Workers, which this browser blocks.", "err");
  }

  // Champions, items, augments and settings for the chosen patch.
  function loadMeta() {
    for (const b of ["runBuild", "findBest", "resetAll", "patchSel"]) $(b).disabled = true;
    return call(["--list", "--json", ...patchArgs()]).then((r) => {
      if (!r.ok) { status("The simulator couldn't load its data: " + r.stderr, "err"); return false; }
      meta = JSON.parse(r.stdout);
      enemyById.clear();
      for (const e of meta.enemies) enemyById.set(e.id.toLowerCase(), e);
      buildFightForm();
      for (const b of ["runBuild", "findBest", "resetAll", "patchSel"]) $(b).disabled = false;
      if (champ) fillFromTrace();
      runLinked();
      return true;
    });
  }
  $("patchSel").addEventListener("change", (e) => {
    patch = e.target.value;
    loadMeta().then((ok) => {
      if (!ok) return;
      status(patch === "pbe"
        ? "PBE patch: simulations now use the test server's numbers. The replay above changes when you simulate."
        : "Live patch: simulations use the current patch's numbers again.");
    });
  });

  window.onReplayLoad = (c, tr, isCustom) => {
    const changedChamp = !champ || champ.id !== c.id;
    if (changedChamp) offerSubmit(null);
    $("buildTitle").textContent = isCustom ? "Your simulated setup" + (tr.patch === "pbe" ? " (PBE patch)" : "") : "Simulated best build";
    champ = c; trace = tr;
    if (meta && (changedChamp || !isCustom)) fillFromTrace();
    runLinked();
  };
  // A leaderboard link (#Jinx&items=…&augs=…) loads that build into the slots and simulates it, once.
  function runLinked() {
    const l = window.linkedBuild;
    if (!l || !meta || !champ || champ.id.toLowerCase() !== l.champion) return;
    window.linkedBuild = null;
    trace = { build: { items: l.items.map((key) => ({ key })), augments: l.augs.map((key) => ({ key })) }, fight: trace.fight };
    fillFromTrace();
    run(true);
  }

  // ---------- build ----------
  function select(options, value, label) {
    const s = document.createElement("select");
    s.setAttribute("aria-label", label);
    s.add(new Option("(empty)", ""));
    for (const o of options) s.add(new Option(o.name + (o.rarity ? " · " + rarityName(o.rarity) : ""), o.key));
    s.value = value || "";
    return s;
  }
  function rarityName(r) { return { S: "Silver", G: "Gold", P: "Prismatic" }[r] || r.charAt(0).toUpperCase() + r.slice(1); }
  // The augments a champion can be offered, sorted by name; ones the simulator can't model yet are marked.
  function augmentsFor(id, keep) {
    const c = meta.champions.find((x) => x.id.toLowerCase() === String(id).toLowerCase());
    const pool = new Set((c && c.augments) || []);
    for (const k of keep || []) pool.add(k);
    return meta.augments.filter((a) => !c || pool.has(a.key))
      .map((a) => a.modeled === false ? { ...a, name: a.name + " (no effect yet)" } : a)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function fillFromTrace() {
    const box = $("buildBox");
    box.querySelectorAll(".slot-row, .sub").forEach((n) => n.remove());
    const boots = meta.items.filter((i) => i.slot === "boots").sort((a, b) => a.name.localeCompare(b.name));
    const legs = meta.items.filter((i) => i.slot !== "boots").sort((a, b) => a.name.localeCompare(b.name));
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
    const augs = augmentsFor(champ.id, augKeys);
    for (let i = 0; i < 4; i++) row(String(i + 1), select(augs, augKeys[i], "Augment " + (i + 1)));
    renderCombo();

    if (!picks) {
      picks = trace.fight.team.slice(0, 5).map((id) => withBuild({ id, stats: {} }));
      const byWeight = meta.enemies.slice().sort((a, b) => b.weight - a.weight);
      for (const e of byWeight) {
        if (picks.length >= 5) break;
        if (!picks.some((p) => p.id === e.id) && e.id.toLowerCase() !== champ.id.toLowerCase())
          picks.push(withBuild({ id: e.id, stats: {} }));
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
  // The Enemies box holds how many enemies fight and how they're chosen; each chosen enemy's
  // champion, stats, items and augments sit under Advanced settings.
  function enemyMode() { return document.querySelector('input[name="emode"]:checked').value; }
  for (const r of document.querySelectorAll('input[name="emode"]')) r.addEventListener("change", renderEnemies);
  const teamSize = () => {
    const s = meta && meta.settings.find((x) => x.key === "team_size");
    const v = fieldValues.team_size !== undefined ? fieldValues.team_size : s ? s.default : 1;
    return Math.max(1, Math.min(5, Math.round(v) || 1));
  };
  function renderEnemies() {
    const box = $("enemyDetail");
    box.textContent = "";
    if (!meta) return;
    const size = meta.settings.find((s) => s.key === "team_size");
    if (size) {
      const f = field(size);
      f.querySelector("input").min = 1; f.querySelector("input").max = 5;
      f.querySelector("input").addEventListener("change", renderEnemies);
      box.append(f);
    }
    const mode = enemyMode();
    const n = teamSize(), word = n === 1 ? "enemy" : `${n} enemies`;
    const p = document.createElement("p"); p.className = "note";
    if (mode === "pool")
      p.textContent = `Each fight draws ${n === 1 ? "one enemy" : word} weighted by how often they're picked in Mayhem, with their HP, resists and damage. ` +
        "To fight a particular champion or change its stats, items or augments, open Advanced settings.";
    else if (mode === "pick")
      p.textContent = `Every fight is against the ${word} set under Advanced settings.`;
    else {
      for (const k of ["target_hp", "target_armor", "target_mr"]) box.append(field(meta.settings.find((s) => s.key === k)));
      p.textContent = "Dummies stand still and don't hit back.";
    }
    box.append(p);
    renderEnemyCards();
  }
  // Each enemy starts with its own most popular items and augments.
  function defaultBuild(id) {
    const e = enemyById.get(String(id).toLowerCase()) || {};
    return { items: (e.items || []).slice(), augs: (e.augments || []).slice() };
  }
  function withBuild(pick) { return Object.assign(pick, defaultBuild(pick.id)); }
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function changedBuild(pick) {
    const d = defaultBuild(pick.id);
    return { items: !sameList(pick.items, d.items), augs: !sameList(pick.augs, d.augs) };
  }
  function changedPick(pick) {
    const c = changedBuild(pick);
    return Object.keys(pick.stats).length > 0 || c.items || c.augs;
  }
  // Editing a chosen enemy means you want to fight it.
  function useChosen() {
    if (enemyMode() === "pick") return;
    $("emodePick").checked = true;
    renderEnemies();
  }
  function renderEnemyCards() {
    const grid = $("advGrid");
    let fs = $("enemyCards");
    if (!fs) {
      fs = document.createElement("fieldset"); fs.id = "enemyCards"; fs.className = "wide";
      grid.prepend(fs);
    }
    fs.textContent = "";
    const lg = document.createElement("legend"); lg.textContent = "Chosen enemies"; fs.append(lg);
    if (!meta || !champ || !picks) return;
    const intro = document.createElement("p"); intro.className = "note";
    intro.textContent = "Used when Enemies is set to Chosen; changing one switches to it. Each enemy starts with its most popular items and augments; its Health, Armor and Magic Resist come from its level and build. Dmg share sets how hard the enemy hits.";
    fs.append(intro);
    const pool = meta.enemies.filter((e) => e.id.toLowerCase() !== champ.id.toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name));
    const items = meta.items.slice().sort((a, b) => a.name.localeCompare(b.name));
    const cards = document.createElement("div"); cards.className = "enemy-cards";
    picks.slice(0, teamSize()).forEach((pick, idx) => {
      const card = document.createElement("div"); card.className = "enemy";
      const mark = () => { card.classList.toggle("changed", changedPick(pick)); countAdvanced(); };
      const s = document.createElement("select"); s.setAttribute("aria-label", "Enemy " + (idx + 1));
      for (const e of pool) s.add(new Option(e.name, e.id));
      s.value = pick.id;
      s.addEventListener("change", () => { pick.id = s.value; pick.stats = {}; withBuild(pick); useChosen(); renderEnemyCards(); });
      const stats = document.createElement("div"); stats.className = "enemy-stats";
      const base = enemyById.get(pick.id.toLowerCase()) || {};
      for (const [key, label, step] of ENEMY_STATS) {
        const l = document.createElement("label");
        l.append(label);
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = step; inp.min = 0;
        inp.value = pick.stats[key] !== undefined ? pick.stats[key] : base[key];
        const markInput = () => inp.classList.toggle("changed", Math.abs(parseFloat(inp.value) - base[key]) > 1e-9);
        inp.addEventListener("input", () => {
          const v = parseFloat(inp.value);
          if (Number.isFinite(v) && Math.abs(v - base[key]) > 1e-9) pick.stats[key] = v; else delete pick.stats[key];
          markInput(); mark(); useChosen();
        });
        markInput();
        l.append(inp); stats.append(l);
      }
      const gear = (label, list, chosen, count) => {
        const wrap = document.createElement("div"); wrap.className = "enemy-gear";
        const h = document.createElement("span"); h.textContent = label; wrap.append(h);
        for (let i = 0; i < count; i++) {
          const g = select(list, chosen[i], `Enemy ${idx + 1} ${label.toLowerCase()} ${i + 1}`);
          g.addEventListener("change", () => {
            const vals = [...wrap.querySelectorAll("select")].map((x) => x.value).filter(Boolean);
            chosen.length = 0; chosen.push(...vals);
            mark(); useChosen();
          });
          wrap.append(g);
        }
        return wrap;
      };
      card.append(s, stats, gear("Items", items, pick.items, 6), gear("Augments", augmentsFor(pick.id, pick.augs), pick.augs, 4));
      cards.append(card);
      mark();
    });
    fs.append(cards);
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
    inp.step = WHOLE_KEYS.includes(s.key) ? 1 : Math.abs(s.default) <= 1 ? 0.05 : s.default >= 100 ? 10 : 1;
    inp.value = fieldValues[s.key] !== undefined ? fieldValues[s.key] : s.default;
    const mark = () => wrap.classList.toggle("changed", Math.abs(parseFloat(inp.value) - s.default) > 1e-9);
    inp.addEventListener("input", () => {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v) && Math.abs(v - s.default) > 1e-9) fieldValues[s.key] = v; else delete fieldValues[s.key];
      mark();
      countAdvanced();
    });
    mark();
    wrap.append(l, inp);
    return wrap;
  }
  function buildFightForm() {
    const byKey = new Map(meta.settings.map((s) => [s.key, s]));
    const box = $("fightBox");
    box.querySelectorAll(".field, .sub").forEach((n) => n.remove());
    for (const k of BASIC_KEYS) if (byKey.has(k)) box.append(field(byKey.get(k)));
    const grid = $("advGrid");
    grid.textContent = "";
    const placed = new Set([...BASIC_KEYS, ...DUMMY_KEYS, "team_size"]);
    const groups = ADVANCED.map(([name, keys]) => {
      keys.forEach((k) => placed.add(k));
      return [name, keys.filter((k) => byKey.has(k))];
    });
    // Settings the engine adds later still show up, in the first group.
    groups[0][1].push(...meta.settings.map((s) => s.key).filter((k) => !placed.has(k)));
    for (const [name, keys] of groups) {
      const fs = document.createElement("fieldset");
      const lg = document.createElement("legend"); lg.textContent = name; fs.append(lg);
      if (keys.includes("combo_order")) fs.id = "castBox";
      for (const k of keys) fs.append(field(byKey.get(k)));
      grid.append(fs);
    }
    if (champ) renderCombo();
    renderEnemies();
    countAdvanced();
  }
  // Cast order when several abilities are ready; defaults to the champion's recommended combo.
  function renderCombo() {
    const box = $("castBox");
    if (!box || !champ) return;
    box.querySelectorAll(".combo-field").forEach((n) => n.remove());
    const wrap = document.createElement("div"); wrap.className = "field combo-field";
    const l = document.createElement("label"); l.htmlFor = "comboInput"; l.textContent = "Combo (cast order), for example EQRW";
    const combo = document.createElement("input");
    combo.id = "comboInput"; combo.type = "text"; combo.maxLength = 4; combo.autocomplete = "off";
    combo.value = combos[champ.id] || defaultCombo();
    const mark = () => { wrap.classList.toggle("changed", combo.value !== defaultCombo()); countAdvanced(); };
    combo.addEventListener("input", () => {
      combo.value = combo.value.toUpperCase().replace(/[^QWER]/g, "");
      combos[champ.id] = combo.value;
      mark();
    });
    wrap.append(l, combo);
    box.prepend(wrap);
    box.prepend(box.querySelector("legend"));
    mark();
  }
  // "Advanced settings (2 changed)", so changes hidden in the closed section aren't forgotten.
  function countAdvanced() {
    const n = $("advGrid").querySelectorAll(".field.changed, .enemy.changed").length;
    $("advCount").textContent = n ? `(${n} changed)` : "";
  }

  // ---------- running ----------
  function args(withBuild) {
    const a = ["--champ", champ.id, "--json", "--trace", "/trace.json", ...patchArgs()];
    const set = Object.entries(fieldValues).filter(([k]) => !DUMMY_KEYS.includes(k) || enemyMode() === "dummy");
    if (enemyMode() === "dummy") set.push(["fixed_target", 1]);
    if (set.length) a.push("--set", set.map(([k, v]) => `${k}=${v}`).join(","));
    if (enemyMode() === "pick")
      a.push("--team", picks.slice(0, teamSize()).map((p) => {
        const c = changedBuild(p);  // a changed build replaces the enemy's own
        return [p.id, ...Object.entries(p.stats).map(([k, v]) => `${k}=${v}`),
          ...(c.items ? ["items=" + p.items.join("+")] : []), ...(c.augs ? ["augs=" + p.augs.join("+")] : [])].join(":");
      }).join(","));
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
    for (const b of ["runBuild", "findBest", "resetAll", "patchSel"]) $(b).disabled = true;
    status(withBuild ? "Simulating 2,000 fights…" : "Searching item and augment builds. This takes a few seconds…", "busy");
    const t0 = performance.now();
    const r = await call(a);
    busy = false;
    for (const b of ["runBuild", "findBest", "resetAll", "patchSel"]) $(b).disabled = false;
    if (!r.ok || !r.trace) {
      status((r.stderr || "The simulation failed.").replace(/^error:\s*/, ""), "err");
      return;
    }
    const res = JSON.parse(r.stdout);
    const tr = JSON.parse(r.trace);
    tr.patch = patch;
    const best = res.builds[0].summary;
    const def = window.ReplayViewer.defaultTrace().summary.mean_dps;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status(`Done in ${secs} s${patch === "pbe" ? " on the PBE patch" : ""}. Average DPS ${Math.round(best.mean_dps).toLocaleString()} ` +
      `(±${Math.round(best.ci95)}), alive for ${best.time_alive.toFixed(1)} s on average. ` +
      `The default setup averaged ${Math.round(def).toLocaleString()}. The replay above now shows a typical fight with these settings.`);
    // ▲/▼ against the default setup, coloured.
    const change = (best.mean_dps - def) / Math.max(1, def);
    if (Math.abs(change) >= 0.005) {
      const d = document.createElement("span");
      d.className = change > 0 ? "up" : "down";
      d.textContent = ` ${change > 0 ? "▲" : "▼"} ${Math.abs(change * 100).toFixed(1)}% DPS vs default`;
      $("simStatus").append(d);
    }
    // Only runs with the default settings on the live patch can go on the leaderboard, so every entry is comparable.
    const combo = $("comboInput") ? $("comboInput").value : "";
    const plain = patch === "live" && !Object.keys(fieldValues).length && enemyMode() === "pool" && (!combo || combo === defaultCombo());
    offerSubmit({ champion: champ.id, items: res.builds[0].build.items, augments: res.builds[0].build.augments, dps: best.mean_dps }, plain);
    showAlternatives(withBuild ? [] : res.builds);
    window.ReplayViewer.showTrace(tr);
    trace = tr;
    fillFromTrace();
  }
  // ---------- leaderboard ----------
  let submission = null;
  function offerSubmit(build, plain) {
    submission = build && plain ? build : null;
    $("submitBox").hidden = !build;
    $("submitScore").hidden = !submission;
    $("submitScore").disabled = false;
    $("submitNote").textContent = !build ? "" : submission
      ? "Put this build on the Simulator leaderboard. It's simulated again on our side before it's listed."
      : "Only builds simulated with the default settings and enemies on the live patch can go on the leaderboard.";
  }
  $("submitScore").addEventListener("click", async () => {
    if (!submission) return;
    $("submitScore").disabled = true;
    $("submitNote").textContent = "Submitting…";
    try {
      const r = await fetch("/api/sim-scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "");
      $("submitNote").textContent = b.status === "verified"
        ? `This build is already on the leaderboard at ${Math.round(b.verified_dps).toLocaleString()} DPS.`
        : b.status === "rejected" ? "This build was already checked and can't go on the leaderboard."
        : "Submitted. It shows on the leaderboard once our simulator has re-run it.";
      $("submitScore").hidden = true;
    } catch (e) {
      $("submitScore").disabled = false;
      $("submitNote").textContent = e.message || "The leaderboard couldn't be reached. Try again in a moment.";
    }
  });

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
    offerSubmit(null);
    buildFightForm();
    window.ReplayViewer.resetTrace();
    status("Back to the default build, enemies and fight settings.");
    if (patch !== "live") {  // and back to the live patch
      patch = $("patchSel").value = "live";
      loadMeta();
    }
  });
})();
