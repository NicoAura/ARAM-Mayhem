// 5v5 teamfight page: pick both teams (and their builds), run the simulator's team mode in the
// Web Worker (sim-worker.js) and show who wins, how long it takes and who goes down when.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ICON = "/assets/cd/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/";
  const TRIALS = 300;

  let meta = null, patch = "live", busy = false;
  const popular = new Map();  // champion id (lower case) -> {items, augments}
  // Each side's five slots: {id, items, augs, custom}
  const teams = { allies: [], foes: [] };

  // ---------- worker ----------
  let worker = null, nextId = 1;
  const pending = new Map();
  function call(args) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage({ id, args });
    });
  }
  function status(text, kind) {
    const el = $("status");
    el.textContent = text;
    el.className = "status" + (kind ? " " + kind : "");
  }
  const patchArgs = () => (patch === "pbe" ? ["--game-data", "data/pbe"] : []);

  // ---------- data ----------
  const champ = (id) => meta.champions.find((c) => c.id.toLowerCase() === String(id).toLowerCase());
  const itemName = (k) => (meta.items.find((i) => i.key === k) || { name: k }).name;
  const augName = (k) => (meta.augments.find((a) => a.key === k) || { name: k }).name;
  function buildOf(id) {
    const p = popular.get(String(id).toLowerCase());
    return { items: p ? p.items.slice() : [], augs: p ? p.augments.slice() : [] };
  }
  function slotFor(id) { const b = buildOf(id); return { id, items: b.items, augs: b.augs, custom: false }; }
  // The most likely enemies (by how often they're picked) that aren't already in a team.
  function likelyFoes(taken) {
    return meta.enemies.slice().sort((a, b) => b.weight - a.weight)
      .filter((e) => champ(e.id) && !taken.has(e.id.toLowerCase())).slice(0, 5).map((e) => slotFor(champ(e.id).id));
  }

  function loadMeta() {
    setBusy(true);
    return call(["--list", "--json", ...patchArgs()]).then((r) => {
      setBusy(false);
      if (!r.ok) { status("The simulator couldn't load its data: " + r.stderr, "err"); return false; }
      meta = JSON.parse(r.stdout);
      meta.champions.sort((a, b) => a.name.localeCompare(b.name));
      popular.clear();
      for (const e of meta.enemies) popular.set(e.id.toLowerCase(), { items: e.items, augments: e.augments });
      if (!teams.allies.length) {
        const want = new URLSearchParams(location.search).get("champ");
        const you = (want && champ(want)) || champ("Jinx") || meta.champions[0];
        const picks = [you.id, "Lulu", "Leona", "Ahri", "Darius"].map((n) => champ(n) || meta.champions[0]);
        const seen = new Set();
        teams.allies = picks.filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => slotFor(c.id));
        teams.foes = likelyFoes(new Set(teams.allies.map((s) => s.id.toLowerCase())));
      } else {
        // A new patch: keep the champions, refresh builds nobody changed.
        for (const side of ["allies", "foes"])
          teams[side] = teams[side].filter((s) => champ(s.id)).map((s) => (s.custom ? s : slotFor(s.id)));
      }
      render();
      return true;
    });
  }

  // ---------- picking ----------
  function select(options, value, label, empty) {
    const s = document.createElement("select");
    s.setAttribute("aria-label", label);
    if (empty) s.add(new Option("(empty)", ""));
    for (const o of options) s.add(new Option(o.name, o.key));
    s.value = value || "";
    return s;
  }
  function icon(id) {
    const c = champ(id), im = document.createElement("img");
    im.alt = "";
    im.loading = "lazy";
    if (c && c.key) im.src = ICON + c.key + ".png";
    im.onerror = () => { im.removeAttribute("src"); };
    return im;
  }
  function render() {
    for (const side of ["allies", "foes"]) {
      const box = $(side);
      box.textContent = "";
      teams[side].forEach((slot, i) => box.append(slotRow(side, i, slot)));
    }
  }
  function slotRow(side, i, slot) {
    const row = document.createElement("div");
    row.className = "slot";
    const pick = document.createElement("div");
    pick.className = "pick";
    const taken = new Set([...teams.allies, ...teams.foes].filter((s) => s !== slot).map((s) => s.id.toLowerCase()));
    const opts = meta.champions.filter((c) => !taken.has(c.id.toLowerCase())).map((c) => ({ key: c.id, name: c.name }));
    const sel = select(opts, slot.id, (side === "allies" ? (i ? "Ally " + i : "Your champion") : "Enemy " + (i + 1)), false);
    sel.addEventListener("change", () => { teams[side][i] = slotFor(sel.value); render(); });
    pick.append(sel);
    if (side === "allies" && i === 0) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "You";
      pick.append(tag);
    }
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.innerHTML = slot.custom ? "<b>Your build</b> · change" : "Most popular build · change";
    det.append(sum);
    det.addEventListener("toggle", () => { if (det.open && !det.querySelector(".gear")) det.append(gear(side, i, slot, sum)); });
    row.append(icon(slot.id), pick, det);
    return row;
  }
  function gear(side, i, slot, sum) {
    const box = document.createElement("div");
    box.className = "gear";
    const items = meta.items.slice().sort((a, b) => a.name.localeCompare(b.name));
    const c = champ(slot.id), pool = new Set((c && c.augments) || []);
    for (const k of slot.augs) pool.add(k);
    const augs = meta.augments.filter((a) => pool.has(a.key))
      .map((a) => (a.modeled === false ? { ...a, name: a.name + " (no effect yet)" } : a))
      .sort((a, b) => a.name.localeCompare(b.name));
    const changed = () => {
      slot.items = [...box.querySelectorAll("select[data-kind=item]")].map((s) => s.value).filter(Boolean);
      slot.augs = [...box.querySelectorAll("select[data-kind=aug]")].map((s) => s.value).filter(Boolean);
      slot.custom = true;
      sum.innerHTML = "<b>Your build</b> · change";
    };
    const head = (t) => { const s = document.createElement("span"); s.textContent = t; box.append(s); };
    head("Items");
    for (let k = 0; k < Math.max(6, slot.items.length); k++) {
      const s = select(items, slot.items[k], "Item " + (k + 1), true);
      s.dataset.kind = "item";
      s.addEventListener("change", changed);
      box.append(s);
    }
    head("Augments");
    for (let k = 0; k < 4; k++) {
      const s = select(augs, slot.augs[k], "Augment " + (k + 1), true);
      s.dataset.kind = "aug";
      s.addEventListener("change", changed);
      box.append(s);
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Most popular build";
    reset.style.gridColumn = "1 / -1";
    reset.addEventListener("click", () => { teams[side][i] = slotFor(slot.id); render(); });
    box.append(reset);
    return box;
  }

  // ---------- running ----------
  function entry(slot) {
    if (!slot.custom) return slot.id;
    let s = slot.id;
    if (slot.items.length) s += ":items=" + slot.items.join("+");
    if (slot.augs.length) s += ":augs=" + slot.augs.join("+");
    return s;
  }
  function setBusy(on) {
    busy = on;
    for (const b of ["runTeam", "randomFoes", "patchSel"]) $(b).disabled = on;
  }
  function run() {
    if (busy || !meta) return;
    const [you, ...allies] = teams.allies;
    const args = ["--champ", you.id, "--allies", allies.map(entry).join(","), "--team", teams.foes.map(entry).join(","),
      "--trials", String(TRIALS), "--json", ...patchArgs()];
    if (you.custom) {
      args.push("--items", you.items.join(","));
      if (you.augs.length) args.push("--augs", you.augs.join(","));
    }
    setBusy(true);
    status("Simulating every champion's fight, then the teamfight…", "busy");
    call(args).then((r) => {
      setBusy(false);
      if (!r.ok) { status("The simulation failed: " + (r.stderr || "unknown error").replace(/^error:\s*/, ""), "err"); return; }
      show(JSON.parse(r.stdout));
      status(patch === "pbe" ? "Done, on the PBE patch's numbers." : "Done. Change anyone and simulate again.");
    });
  }
  const pct = (x) => Math.round(x * 100) + "%";
  function show(res) {
    $("result").hidden = false;
    const w = $("winRate");
    w.textContent = pct(res.win_rate);
    w.className = res.win_rate >= 0.55 ? "good" : res.win_rate <= 0.45 ? "bad" : "";
    $("fightLen").textContent = res.fight_length.toFixed(1) + " s";
    $("teamDps").textContent = Math.round(res.team_dps).toLocaleString();
    $("enemyDps").textContent = Math.round(res.enemy_dps).toLocaleString();
    table($("allyTable"), "Your team", res.members);
    table($("foeTable"), "Enemy team", res.enemies);
    // Who goes down when, in a median-length fight.
    const track = $("track"), end = Math.max(res.fight_length, ...res.timeline.map((e) => e.t), 1);
    track.querySelectorAll(".tick").forEach((n) => n.remove());
    // Champions going down close together are spread apart so every portrait shows.
    const gap = (36 / Math.max(200, track.clientWidth)) * 100;
    for (const side of ["ally", "enemy"]) {
      const evs = res.timeline.filter((e) => e.side === side);
      const xs = [];
      for (const e of evs) xs.push(Math.max(3, (e.t / end) * 100, xs.length ? xs[xs.length - 1] + gap : 0));
      // Too many to fit: slide them back left, keeping the gaps.
      for (let i = xs.length - 1; i >= 0; i--) xs[i] = Math.min(xs[i], 97 - (xs.length - 1 - i) * gap);
      evs.forEach((e, i) => {
        const t = document.createElement("div");
        t.className = "tick " + e.side;
        t.style.left = Math.max(0, xs[i]) + "%";
        const c = champ(e.champion);
        t.title = (c ? c.name : e.champion) + " goes down at " + e.t.toFixed(1) + " s";
        const lbl = document.createElement("span");
        lbl.textContent = e.t.toFixed(1) + "s";
        t.append(icon(e.champion), lbl);
        track.append(t);
      });
    }
    $("axisEnd").textContent = end.toFixed(1) + " s";
  }
  function table(el, title, list) {
    el.textContent = "";
    const head = el.insertRow();
    for (const h of [title, "DPS", "Share", "Standing", "Survives"]) {
      const th = document.createElement("th");
      th.textContent = h;
      head.append(th);
    }
    for (const m of list) {
      const tr = el.insertRow();
      const who = tr.insertCell();
      who.className = "who";
      const nm = document.createElement("span");
      nm.textContent = m.name;
      who.title = m.build.items.map((i) => i.name || itemName(i.key || i)).concat(m.build.augments.map((a) => a.name || augName(a.key || a))).join(", ");
      who.append(icon(m.champion), nm);
      tr.insertCell().textContent = Math.round(m.summary.mean_dps).toLocaleString();
      const share = tr.insertCell();
      share.textContent = pct(m.share);
      const bar = document.createElement("span");
      bar.className = "share";
      bar.innerHTML = "<i></i>";
      bar.firstChild.style.width = Math.round(m.share * 100) + "%";
      share.append(bar);
      tr.insertCell().textContent = m.time_alive.toFixed(1) + " s";
      tr.insertCell().textContent = pct(m.survival);
    }
  }

  // ---------- wiring ----------
  $("runTeam").addEventListener("click", run);
  $("randomFoes").addEventListener("click", () => {
    if (!meta) return;
    teams.foes = likelyFoes(new Set(teams.allies.map((s) => s.id.toLowerCase())));
    render();
  });
  $("patchSel").addEventListener("change", (e) => {
    patch = e.target.value;
    loadMeta().then((ok) => {
      if (ok) status(patch === "pbe" ? "PBE patch: the fight now uses the test server's numbers." : "Live patch again.");
    });
  });
  try {
    worker = new Worker("sim-worker.js?v=" + (window.REPLAY_VERSION || "0"));
    worker.onmessage = (e) => { const r = pending.get(e.data.id); pending.delete(e.data.id); if (r) r(e.data); };
    worker.onerror = () => status("The simulator couldn't start in this browser.", "err");
    loadMeta().then((ok) => { if (ok) status("Pick the teams, then simulate."); });
  } catch (e) {
    status("The simulator needs Web Workers, which this browser blocks.", "err");
  }
})();
