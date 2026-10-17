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
      if (!r.ok) { status(T("The simulator couldn't load its data:") + " " + r.stderr, "err"); return false; }
      meta = JSON.parse(r.stdout);
      // Official names in the page's language.
      for (const i of meta.items) i.name = NAME("items", i.id, i.name);
      for (const a of meta.augments) a.name = NAME("augments", a.id, a.name);
      for (const c of meta.champions) c.name = NAME("champions", c.id, c.name);
      meta.champions.sort((a, b) => a.name.localeCompare(b.name));
      popular.clear();
      for (const e of meta.enemies) popular.set(e.id.toLowerCase(), { items: e.items, augments: e.augments });
      if (!teams.allies.length) {
        const want = new URLSearchParams(location.search).get("champ");
        // The champion named in the link, else a random one each visit.
        const you = (want && champ(want)) || meta.champions[Math.floor(Math.random() * meta.champions.length)];
        const picks = [you.id, ...["Lulu", "Leona", "Ahri", "Darius", "Jinx"].filter((n) => n.toLowerCase() !== you.id.toLowerCase()).slice(0, 4)]
          .map((n) => champ(n) || meta.champions[0]);
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
  // "Your build · change" or "Most popular build · change" on a champion's build toggle.
  function summaryText(sum, custom) {
    sum.textContent = "";
    if (custom) { const b = document.createElement("b"); b.textContent = T("Your build"); sum.append(b); }
    else sum.append(T("Most popular build"));
    sum.append(" · " + T("change"));
  }
  function slotRow(side, i, slot) {
    const row = document.createElement("div");
    row.className = "slot";
    const pick = document.createElement("div");
    pick.className = "pick";
    const taken = new Set([...teams.allies, ...teams.foes].filter((s) => s !== slot).map((s) => s.id.toLowerCase()));
    const opts = meta.champions.filter((c) => !taken.has(c.id.toLowerCase())).map((c) => ({ key: c.id, name: c.name }));
    const sel = select(opts, slot.id, (side === "allies" ? (i ? T("Ally {n}", { n: i }) : T("Your champion")) : T("Enemy {n}", { n: i + 1 })), false);
    sel.addEventListener("change", () => { teams[side][i] = slotFor(sel.value); render(); });
    pick.append(sel);
    if (side === "allies" && i === 0) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = T("You");
      pick.append(tag);
    }
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    summaryText(sum, slot.custom);
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
      .map((a) => (a.modeled === false ? { ...a, name: a.name + " " + T("(no effect yet)") } : a))
      .sort((a, b) => a.name.localeCompare(b.name));
    const changed = () => {
      slot.items = [...box.querySelectorAll("select[data-kind=item]")].map((s) => s.value).filter(Boolean);
      slot.augs = [...box.querySelectorAll("select[data-kind=aug]")].map((s) => s.value).filter(Boolean);
      slot.custom = true;
      summaryText(sum, true);
    };
    const head = (t) => { const s = document.createElement("span"); s.textContent = t; box.append(s); };
    head(T("Items"));
    for (let k = 0; k < Math.max(6, slot.items.length); k++) {
      const s = select(items, slot.items[k], T("Item {n}", { n: k + 1 }), true);
      s.dataset.kind = "item";
      s.addEventListener("change", changed);
      box.append(s);
    }
    head(T("Augments"));
    for (let k = 0; k < 4; k++) {
      const s = select(augs, slot.augs[k], T("Augment {n}", { n: k + 1 }), true);
      s.dataset.kind = "aug";
      s.addEventListener("change", changed);
      box.append(s);
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = T("Most popular build");
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
    status(T("Simulating every champion's fight, then the teamfight…"), "busy");
    call(args).then((r) => {
      setBusy(false);
      if (!r.ok) { status(T("The simulation failed:") + " " + (r.stderr || T("unknown error")).replace(/^error:\s*/, ""), "err"); return; }
      show(JSON.parse(r.stdout));
      status(patch === "pbe" ? T("Done, on the PBE patch's numbers.") : T("Done. Change anyone and simulate again."));
    });
  }
  const pct = (x) => Math.round(x * 100) + "%";
  function show(res) {
    $("result").hidden = false;
    const w = $("winRate");
    w.textContent = pct(res.win_rate);
    w.className = res.win_rate >= 0.55 ? "good" : res.win_rate <= 0.45 ? "bad" : "";
    // When embedded in the site (same origin), let it buzz and chime when your team is favoured.
    if (res.win_rate > 0.5 && window.parent !== window) {
      try { window.parent.postMessage({ type: "deeparam-haptic", kind: "win" }, location.origin); } catch {}
    }
    $("fightLen").textContent = T("{n} s", { n: res.fight_length.toFixed(1) });
    $("teamDps").textContent = Math.round(res.team_dps).toLocaleString();
    $("enemyDps").textContent = Math.round(res.enemy_dps).toLocaleString();
    table($("allyTable"), T("Your team"), res.members);
    table($("foeTable"), T("Enemy team"), res.enemies);
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
        t.title = T("{name} goes down at {t} s", { name: c ? c.name : e.champion, t: e.t.toFixed(1) });
        const lbl = document.createElement("span");
        lbl.textContent = e.t.toFixed(1) + "s";
        t.append(icon(e.champion), lbl);
        track.append(t);
      });
    }
    $("axisEnd").textContent = T("{n} s", { n: end.toFixed(1) });
  }
  function table(el, title, list) {
    el.textContent = "";
    const head = el.insertRow();
    for (const h of [title, "DPS", T("Share"), T("Standing"), T("Survives")]) {
      const th = document.createElement("th");
      th.textContent = h;
      head.append(th);
    }
    for (const m of list) {
      const tr = el.insertRow();
      const who = tr.insertCell();
      who.className = "who";
      const nm = document.createElement("span");
      nm.textContent = NAME("champions", m.champion, m.name);
      who.title = m.build.items.map((i) => itemName(i.key || i)).concat(m.build.augments.map((a) => augName(a.key || a))).join(", ");
      who.append(icon(m.champion), nm);
      tr.insertCell().textContent = Math.round(m.summary.mean_dps).toLocaleString();
      const share = tr.insertCell();
      share.textContent = pct(m.share);
      const bar = document.createElement("span");
      bar.className = "share";
      bar.innerHTML = "<i></i>";
      bar.firstChild.style.width = Math.round(m.share * 100) + "%";
      share.append(bar);
      tr.insertCell().textContent = T("{n} s", { n: m.time_alive.toFixed(1) });
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
      if (ok) status(patch === "pbe" ? T("PBE patch: the fight now uses the test server's numbers.") : T("Live patch again."));
    });
  });
  try {
    worker = new Worker("sim-worker.js?v=" + (window.REPLAY_VERSION || "0"));
    worker.onmessage = (e) => { const r = pending.get(e.data.id); pending.delete(e.data.id); if (r) r(e.data); };
    worker.onerror = () => status(T("The simulator couldn't start in this browser."), "err");
    window.I18N.ready.then(loadMeta).then((ok) => { if (ok) status(T("Pick the teams, then simulate.")); });
  } catch (e) {
    status(T("The simulator needs Web Workers, which this browser blocks."), "err");
  }
})();
