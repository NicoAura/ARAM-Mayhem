// Fight replay for the ARAM Mayhem simulator. Plays a traced fight (mayhem_sim --trace)
// on a canvas. Fighters are animated 3D models (models3d.js) posed from the timeline, and
// enemies cast their own abilities; Riot's ability clips are the fallback when your
// champion has no model.
// Data comes from replay-data/, built by tools/build_replay_assets.py.
(() => {
  "use strict";
  const DATA = "replay-data/";
  const BUST = "?v=" + (window.REPLAY_VERSION || "0");
  const SLOT_COLORS = { Q: "#4fc3f7", W: "#7bd88f", E: "#f4b860", R: "#e66ad2" };
  const TYPE_COLORS = { physical: "#f08a4b", magic: "#7aa2ff", true: "#f4f4f4" };
  const SOURCE_COLORS = ["#c9d6e2", SLOT_COLORS.Q, SLOT_COLORS.W, SLOT_COLORS.E, SLOT_COLORS.R, "#b9a3ff"];
  const SLOT_COL = { P: 1, Q: 2, W: 3, E: 4, R: 5 };
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  let index = null, traces = null, sprite = null, byId = new Map();
  // Which abilities move their caster (dash or blink), from the game's spell tags (tools/build_anim_data.py).
  let anims = {};
  fetch(DATA + "anims.json" + BUST).then((r) => (r.ok ? r.json() : {})).then((a) => {
    for (const [k, v] of Object.entries(a)) anims[k.toLowerCase()] = v;
  }).catch(() => {});
  // Champions the game data doesn't cover fall back to index.json's "dash" (from the ability descriptions).
  const moveOf = (id, slot) => {
    const a = anims[String(id).toLowerCase()];
    if (a) return (a[slot] || {}).move || null;
    const c = byId.get(String(id).toLowerCase());
    return c && c.dash && c.dash.includes(slot) ? "dash" : null;
  };
  let champ = null, trace = null, fight = null;
  let t = 0, playing = true, speed = 1, lastFrame = 0;
  const shown = new Map(); // enemy uid -> displayed {x, y, hp}
  const custom = {};       // champion id -> trace the user simulated with their own settings

  // ---------- loading ----------
  Promise.all([
    fetch(DATA + "index.json" + BUST).then((r) => r.json()),
    fetch(DATA + "traces.json" + BUST).then((r) => r.json()),
    new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = DATA + "sprites.webp" + BUST; }),
  ]).then(([idx, tr, im]) => {
    index = idx; traces = tr; sprite = im;
    for (const c of index.champions) byId.set(c.id.toLowerCase(), c);
    const sel = $("champ");
    const list = index.champions.filter((c) => traces[c.id]).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of list) sel.add(new Option(c.name, c.id));
    const fromHash = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    const start = byId.get(fromHash) || byId.get("ahri") || list[0];
    sel.value = start.id;
    load(start.id);
    requestAnimationFrame(frame);
    if (window.onReplayData) window.onReplayData(index);
  }).catch((err) => {
    $("title").textContent = "Replays could not be loaded";
    $("clipNote").textContent = "Build them with tools/build_replay_assets.py, then serve this folder over HTTP. (" + err + ")";
  });

  // ---------- one champion's fight ----------
  function load(id) {
    champ = byId.get(id.toLowerCase());
    trace = custom[champ.id] || traces[champ.id];
    fight = prepare(trace);
    t = 0; playing = true; shown.clear(); clipState.slot = null;
    $("play").textContent = "Pause";
    $("title").textContent = champ.name + (champ.title ? ", " + champ.title : "");
    $("total").textContent = fight.duration.toFixed(1);
    try { history.replaceState(null, "", "#" + champ.id); } catch (e) { /* sandboxed */ }
    renderBuild();
    renderAbilities();
    setupClip();
    setupModels();
    drawTrack();
    if (window.onReplayLoad) window.onReplayLoad(champ, trace, !!custom[champ.id]);
  }

  // Hooks for the simulation settings panel (sim-panel.js).
  window.ReplayViewer = {
    champion: () => champ,
    defaultTrace: () => traces[champ.id],
    showTrace(tr) { custom[champ.id] = tr; load(champ.id); },
    resetTrace() { delete custom[champ.id]; load(champ.id); },
  };

  // Turns the event list into lookups the renderer needs at any time t.
  function prepare(tr) {
    const ev = tr.events;
    const f = { duration: tr.fight.duration, engage: tr.fight.engage_at, maxHp: tr.fight.max_hp, events: ev,
      casts: [], attacks: [], procs: [], cc: [], kills: [], self: [], spawns: new Map(), focus: [], numbers: [],
      damage: [], death: null };
    let lastNum = null;
    for (const e of ev) {
      switch (e.k) {
        case "cast": f.casts.push(e); break;
        case "attack": f.attacks.push(e); break;
        case "proc": f.procs.push(e); break;
        case "cc": f.cc.push(e); break;
        case "kill": f.kills.push(e); break;
        case "self": f.self.push(e); break;
        case "death": f.death = e; f.self.push(e); break;
        case "spawn": f.spawns.set(e.u, e); break;
        case "focus": f.focus.push(e); break;
        case "damage": {
          f.damage.push(e);
          // Merge ticks that land together on one target so numbers stay readable.
          if (lastNum && lastNum.u === e.u && lastNum.x === e.x && e.t - lastNum.t < 0.12) lastNum.a += e.a || 0;
          else { lastNum = { t: e.t, u: e.u, x: e.x, a: e.a || 0, src: e.src }; f.numbers.push(lastNum); }
          break;
        }
      }
    }
    // When each slot is next cast, for the cooldown sweep.
    const bySlot = {};
    for (const c of f.casts) (bySlot[c.s] = bySlot[c.s] || []).push(c);
    for (const list of Object.values(bySlot))
      list.forEach((c, i) => { c.next = i + 1 < list.length ? list[i + 1].t : f.duration; c.land = c.t + (c.a || 0); c.n = i; });
    f.enemyCasts = enemyCasts(f);
    // Crits on attacks: tag the matching damage number.
    for (const a of f.attacks) if (a.f) {
      const n = f.numbers.find((n) => n.u === a.u && Math.abs(n.t - a.t) < 1e-6 && n.src === 0);
      if (n) n.crit = true;
    }
    return f;
  }

  // Enemies open with their recommended combo when they engage (data/combos.json), then
  // keep casting their basic abilities in that order every few seconds; R only once. Each crowd control on you is an enemy's ability landing, so a living enemy
  // casts one just before it (their R if it comes before the engage). The simulator
  // models enemy damage as a steady rate, so these casts set the animations only.
  function enemyCasts(f) {
    const life = new Map(), champs = new Map();
    for (const e of f.events) {
      if (e.k === "spawn") { life.set(e.u, { born: e.t, died: f.duration }); champs.set(e.u, e.x); }
      else if (e.k === "kill" && life.has(e.u)) life.get(e.u).died = e.t;
    }
    const comboOf = (u) => ((byId.get(String(champs.get(u)).toLowerCase()) || {}).combo || "QWER").split("");
    const out = new Map();
    for (const [u, L] of life) out.set(u, []);
    for (const c of f.cc) {
      const alive = [...life].filter(([, L]) => L.born <= c.t && c.t < L.died);
      if (!alive.length) continue;
      const [u] = alive[Math.floor(c.t * 7) % alive.length];
      out.get(u).push({ t: Math.max(0, c.t - 0.3), s: c.t < f.engage ? "R" : comboOf(u).find((x) => x !== "R"), cc: true });
    }
    for (const [u, L] of life) {
      const list = out.get(u);
      // Their recommended combo on engaging (R included), then the basic abilities in the same order.
      const combo = comboOf(u);
      const basics = combo.filter((x) => x !== "R");
      let t = Math.max(L.born, f.engage) + 0.3 + ((u * 0.73) % 1.2);
      const usedR = list.some((c) => c.s === "R");
      for (const x of combo) {
        if (t >= L.died - 0.2) break;
        if (x === "R" && usedR) continue;
        list.push({ t, s: x }); t += 1.05;
      }
      for (let k = 0; basics.length; k++) {
        t += 1.6 + ((u * 1.37 + k) % 1.5);
        if (t >= L.died - 0.2) break;
        list.push({ t, s: basics[k % basics.length] });
      }
      list.sort((a, b) => a.t - b.t);
      // Keep casts apart so each animation can play out; crowd control wins a clash.
      const kept = [];
      for (const c of list) {
        const last = kept[kept.length - 1];
        if (!last || c.t - last.t >= 1) kept.push(c);
        else if (c.cc && !last.cc) kept[kept.length - 1] = c;
      }
      const count = {};
      for (const c of kept) { c.n = count[c.s] || 0; count[c.s] = c.n + 1; }
      out.set(u, kept);
    }
    return out;
  }
  function enemyCastAt(uid, time) {
    let cast = null;
    for (const c of fight.enemyCasts.get(uid) || []) { if (c.t > time) break; cast = c; }
    return cast && time - cast.t < castWindow("e" + uid, cast) ? cast : null;
  }

  // ---------- state at time t ----------
  function stateAt(time) {
    const s = { enemies: new Map(), focus: -1, kills: 0, damage: 0, bySource: [0, 0, 0, 0, 0, 0], selfHp: fight.maxHp,
      cc: false, dead: false };
    for (const e of fight.events) {
      if (e.t > time) break;
      if (e.k === "spawn") s.enemies.set(e.u, { uid: e.u, champ: e.x, hp: e.hp, max: e.max, born: e.t, died: null });
      else if (e.k === "focus") s.focus = e.u;
      else if (e.k === "damage") {
        const en = s.enemies.get(e.u);
        if (en) en.hp = e.hp;
        s.damage += e.a || 0;
        if (e.src >= 0) s.bySource[e.src] += e.a || 0;
      } else if (e.k === "kill") {
        const en = s.enemies.get(e.u);
        if (en) { en.hp = 0; en.died = e.t; }
        s.kills++;
      }
    }
    // Own HP falls steadily between samples.
    let prev = null, next = null;
    for (const e of fight.self) { if (e.t <= time) prev = e; else { next = e; break; } }
    if (prev) {
      s.selfHp = prev.hp;
      if (next && next.t > prev.t) s.selfHp = prev.hp + (next.hp - prev.hp) * (time - prev.t) / (next.t - prev.t);
    }
    s.dead = !!(fight.death && fight.death.t <= time);
    if (s.dead) s.selfHp = 0;
    s.cc = fight.cc.some((c) => c.t <= time && time < c.a);
    return s;
  }

  // ---------- drawing helpers ----------
  const arena = $("arena"), ctx = arena.getContext("2d");
  const overlayCanvas = $("arenaOverlay"), overlay = overlayCanvas.getContext("2d");
  const modelCanvas = $("arena3d");
  function iconRow(champId) { const c = byId.get(String(champId).toLowerCase()); return c ? c.row : -1; }
  // Without the icon atlas (the website doesn't ship Riot art), icons load one by one
  // from Data Dragon; until one arrives its square stays blank.
  const ddIcons = new Map();
  function ddImage(row, col) {
    const c = index.champions[row], rel = c && c.icons && c.icons[col];
    if (!rel) return null;
    let im = ddIcons.get(rel);
    if (!im) {
      im = new Image(); im.crossOrigin = "anonymous";
      im.src = "https://ddragon.leagueoflegends.com/cdn/" + index.ddragon_version + "/img/" + rel;
      ddIcons.set(rel, im);
    }
    return im;
  }
  function ddIcon(row, col) {
    const im = ddImage(row, col);
    return im && im.complete && im.naturalWidth ? im : null;
  }
  // An icon on its own canvas, drawn again once a Data Dragon icon finishes loading.
  function paintIcon(c, row, col, size) {
    const g = c.getContext("2d");
    drawIcon(g, row, col, 0, 0, size, false);
    const im = !sprite && row >= 0 ? ddImage(row, col) : null;
    if (im && !(im.complete && im.naturalWidth))
      im.addEventListener("load", () => { g.clearRect(0, 0, size, size); drawIcon(g, row, col, 0, 0, size, false); }, { once: true });
  }
  function drawIcon(g, row, col, x, y, size, round) {
    g.save();
    if (round) { g.beginPath(); g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
    const single = row >= 0 && !sprite ? ddIcon(row, col) : null;
    if (row >= 0 && sprite) {
      const S = index.icon_size;
      g.drawImage(sprite, col * S, row * S, S, S, x, y, size, size);
    } else if (single) {
      g.drawImage(single, x, y, size, size);
    } else {
      g.fillStyle = "#262626"; g.fillRect(x, y, size, size);
    }
    g.restore();
  }
  function hpBar(g, x, y, w, frac, color) {
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x - 1, y - 1, w + 2, 8);
    g.fillStyle = color; g.fillRect(x, y, Math.max(0, w * Math.min(1, frac)), 6);
  }
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

  function resize() {
    const r = arena.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.width * 9 / 16 * dpr);
    if (arena.width !== w || arena.height !== h) { arena.width = w; arena.height = h; overlayCanvas.width = w; overlayCanvas.height = h; }
    return dpr;
  }

  // Seats: you on the left, the enemy you're hitting in front, the rest of their team behind.
  function seats(W, H, n) {
    const front = { x: W * 0.6, y: H * 0.55 };
    const back = [];
    for (let i = 0; i < n; i++) {
      const a = (-0.6 + 1.2 * (n === 1 ? 0.5 : i / (n - 1)));
      back.push({ x: W * 0.8 + Math.cos(a) * W * 0.05, y: H * 0.55 + Math.sin(a) * H * 0.34 });
    }
    return { me: { x: W * 0.2, y: H * 0.55 }, front, back };
  }

  // How long a cast's animation holds: its clips' length once the model is loaded (a channel
  // or a multi-part ability runs longer), at least 1.1 s, and never past the next cast.
  function castWindow(key, cast) {
    const M = window.Models3D && window.Models3D.ok ? window.Models3D : null;
    const len = M ? M.castLength(key, cast.s, cast.n) : 0;
    return Math.min(Math.max(1.1, len), 3, (cast.next || Infinity) - cast.t);
  }
  // How far a dash or blink has carried its caster toward the target, 0 to 1, at age k seconds
  // into the cast: a dash slides out and back, a blink jumps there and back.
  function travel(move, k) {
    if (!move || k < 0 || k > 1.1) return 0;
    if (move === "blink") return k < 0.85 ? 0.72 : 0;
    const out = Math.min(1, k / 0.22), back = k > 0.7 ? Math.min(1, (k - 0.7) / 0.35) : 0;
    return 0.62 * (ease(out) - ease(back));
  }
  // Which animation each model plays at time t, worked out from the timeline so
  // scrubbing shows the same pose as playing.
  function myAnim(time, s) {
    if (s.dead) return { role: "death", t: time - fight.death.t, loop: false };
    let cast = null;
    for (const c of fight.casts) { if (c.t > time) break; cast = c; }
    if (cast && time - cast.t < castWindow("me", cast)) return { role: cast.s, t: time - cast.t, loop: false, n: cast.n };
    if (s.cc) return { role: "stunned", t: time, loop: true };
    let atk = null;
    for (const a of fight.attacks) { if (a.t - 0.3 > time) break; atk = a; }
    if (atk && time - (atk.t - 0.3) < 0.75) return { role: atk.f ? "crit" : "attack", t: time - (atk.t - 0.3), loop: false };
    return { role: "idle", t: time, loop: true };
  }
  function enemyAnim(time, en) {
    if (en.died !== null) return { role: "death", t: time - en.died, loop: false };
    const cast = enemyCastAt(en.uid, time);
    if (cast) return { role: cast.s, t: time - cast.t, loop: false, n: cast.n };
    if (time < fight.engage) return { role: "idle", t: time + en.uid * 0.7, loop: true };
    return { role: "attack", t: time + en.uid * 0.37, loop: true };
  }

  function drawArena(time, dt) {
    const dpr = resize();
    // Scale: bigger shapes on narrow screens so portraits stay readable on a phone.
    const W = arena.width, H = arena.height, u = W / dpr < 600 ? W / 760 : W / 1280;
    const s = stateAt(time);
    // Ground: the Howling Abyss bridge.
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#0e1822"); grd.addColorStop(1, "#0a1118");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = "#13212e"; g.fillRect(0, H * 0.18, W, H * 0.74);
    g.strokeStyle = "rgba(143,211,255,.08)"; g.lineWidth = 2 * u;
    for (let x = -H; x < W; x += 80 * u) { g.beginPath(); g.moveTo(x, H * 0.18); g.lineTo(x + H * 0.74, H * 0.92); g.stroke(); }
    g.strokeStyle = "rgba(143,211,255,.25)"; g.lineWidth = 3 * u;
    g.beginPath(); g.moveTo(0, H * 0.18); g.lineTo(W, H * 0.18); g.moveTo(0, H * 0.92); g.lineTo(W, H * 0.92); g.stroke();

    const alive = [...s.enemies.values()].filter((e) => e.died === null || time - e.died < 0.8);
    const others = alive.filter((e) => e.uid !== s.focus).sort((a, b) => a.uid - b.uid);
    const st = seats(W, H, Math.max(1, others.length));
    const target = (en) => (en.uid === s.focus ? st.front : st.back[others.indexOf(en)] || st.back[0]);
    for (const en of alive) {
      const want = target(en);
      let d = shown.get(en.uid);
      if (!d || dt <= 0 || dt > 0.5) { d = { x: want.x, y: want.y }; shown.set(en.uid, d); }
      else { const k = 1 - Math.exp(-dt * 8); d.x += (want.x - d.x) * k; d.y += (want.y - d.y) * k; }
    }
    const posOf = (uid) => shown.get(uid) || st.front;
    const R = 46 * u;          // your portrait radius
    const r = 34 * u;          // enemy portrait radius

    // Your attacks: melee lunges, ranged projectiles.
    let lunge = 0;
    for (const a of fight.attacks) {
      const age = time - a.t;
      if (age < -0.18 || age > 0.25) continue;
      const to = posOf(a.u);
      if (trace.ranged) {
        if (age < 0) {
          const p = 1 + age / 0.18;
          const x = st.me.x + (to.x - st.me.x) * p, y = st.me.y + (to.y - st.me.y) * p;
          g.fillStyle = a.f ? "#ffd36b" : "#e9f3ff";
          g.beginPath(); g.arc(x, y, (a.f ? 7 : 4.5) * u, 0, Math.PI * 2); g.fill();
        }
      } else if (Math.abs(age) < 0.15) lunge = Math.max(lunge, 1 - Math.abs(age) / 0.15);
    }

    // Ability casts.
    for (const c of fight.casts) {
      const age = time - c.land;
      if (time < c.t || age > 0.6) continue;
      const col = SLOT_COLORS[c.s] || "#fff";
      const to = c.u >= 0 ? posOf(c.u) : st.front;
      const miss = !c.f;
      if (time < c.land) {
        // Wind-up ring around you.
        const p = (time - c.t) / Math.max(0.05, c.a || 0.05);
        g.strokeStyle = col; g.lineWidth = 4 * u;
        g.beginPath(); g.arc(st.me.x, st.me.y, R + 10 * u, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
      }
      const fly = 0.2;
      if (c.x === "aoe") {
        if (age > -0.1) {
          const p = ease((age + 0.1) / 0.5);
          g.strokeStyle = col; g.globalAlpha = 1 - p * 0.9; g.lineWidth = 6 * u;
          g.beginPath(); g.arc(miss ? to.x + 40 * u : to.x, to.y, (40 + 150 * p) * u, 0, Math.PI * 2); g.stroke();
          g.fillStyle = col; g.globalAlpha = 0.18 * (1 - p);
          g.beginPath(); g.arc(miss ? to.x + 40 * u : to.x, to.y, (40 + 150 * p) * u, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
      } else if (c.x === "line") {
        if (age > -fly && age < 0.35) {
          const p = Math.min(1, (age + fly) / fly);
          const ty = miss ? to.y - 70 * u : to.y;
          const ex = st.me.x + (W * 1.05 - st.me.x) * p, ey = st.me.y + (ty - st.me.y) * ((ex - st.me.x) / (to.x - st.me.x || 1));
          g.strokeStyle = col; g.lineCap = "round";
          g.globalAlpha = age > 0 ? Math.max(0, 1 - age / 0.35) : 1;
          g.lineWidth = 14 * u; g.beginPath(); g.moveTo(st.me.x, st.me.y); g.lineTo(ex, ey); g.stroke();
          g.globalAlpha *= 0.5; g.lineWidth = 30 * u; g.stroke();
          g.globalAlpha = 1;
        }
      } else if (age > -fly && age < 0.3) {
        if (age < 0) {
          const p = 1 + age / fly;
          const ty = miss ? to.y - 80 * u : to.y;
          const x = st.me.x + (to.x - st.me.x) * p, y = st.me.y + (ty - st.me.y) * p;
          g.fillStyle = col; g.beginPath(); g.arc(x, y, 11 * u, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 0.35; g.beginPath(); g.arc(x - (to.x - st.me.x) * 0.04, y, 18 * u, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        } else if (!miss) {
          g.strokeStyle = col; g.globalAlpha = 1 - age / 0.3; g.lineWidth = 5 * u;
          g.beginPath(); g.arc(to.x, to.y, r + age * 120 * u, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
        }
      }
      if (miss && age > 0 && age < 0.6) floatText(overlay, "MISS", to.x, to.y - r - 30 * u - age * 40 * u, 1 - age / 0.6, "#c9d6e2", 18 * u);
    }

    // Fighters: 3D models when they're loaded (models3d.js), otherwise portraits.
    let meX = st.me.x + (posOf(s.focus).x - st.me.x) * 0.25 * lunge, meY = st.me.y;
    // Dashes and blinks carry your model toward your target.
    // A later cast doesn't cancel the move (Zed's E right after his R stays at the target).
    let myCast = null, myTravel = 0;
    for (const c of fight.casts) {
      if (c.t > time) break;
      const m = s.dead ? 0 : travel(moveOf(champ.id, c.s), time - c.t);
      if (m > myTravel) { myTravel = m; myCast = c; }
    }
    const myMove = myCast ? moveOf(champ.id, myCast.s) : null;
    if (myTravel > 0) {
      const to = posOf(s.focus);
      meX = st.me.x + (to.x - st.me.x) * Math.max(myTravel, 0.25 * lunge);
      meY = st.me.y + (to.y - st.me.y) * myTravel;
    }
    const blinks = [];
    if (myMove === "blink" && myCast) blinks.push({ k: time - myCast.t, a: st.me, b: { x: meX, y: meY } });
    const M = window.Models3D && window.Models3D.ok ? window.Models3D : null;
    let heads = {};
    if (M) {
      const fighters = [{ key: "me", champ: champ.id, x: meX, y: meY, face: 1, ...myAnim(time, s) }];
      for (const en of alive) {
        let p = posOf(en.uid);
        const ec = en.died === null ? enemyCastAt(en.uid, time) : null;
        const em = ec && moveOf(en.champ, ec.s);
        const et = em ? travel(em, time - ec.t) : 0;
        if (et > 0) {
          const q = { x: p.x + (st.me.x - p.x) * et, y: p.y + (st.me.y - p.y) * et };
          if (em === "blink") blinks.push({ k: time - ec.t, a: p, b: q });
          p = q;
        }
        fighters.push({ key: "e" + en.uid, champ: en.champ, x: p.x, y: p.y, face: -1,
          scale: en.uid === s.focus ? 1 : 0.85, visible: en.died === null || time - en.died < 1.6, ...enemyAnim(time, en) });
      }
      heads = M.frame(fighters, W, H);
    }
    const og = overlay;
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.clearRect(0, 0, W, H);
    // Blinks: a flash where the caster leaves and where they land, and again on the way back.
    for (const b of blinks) {
      for (const [age, from, to] of [[b.k, b.a, b.b], [b.k - 0.85, b.b, b.a]]) {
        if (age < 0 || age > 0.3) continue;
        og.globalAlpha = 1 - age / 0.3; og.strokeStyle = "#e9f3ff"; og.lineWidth = 2.5 * u;
        for (const p of [from, to]) { og.beginPath(); og.ellipse(p.x, p.y, (18 + age * 90) * u, (7 + age * 35) * u, 0, 0, Math.PI * 2); og.stroke(); }
      }
    }
    og.globalAlpha = 1;

    // Enemies.
    for (const en of alive) {
      const p = posOf(en.uid);
      const born = ease((time - en.born) / 0.3);
      const fade = en.died !== null ? 1 - (time - en.died) / 0.8 : 1;
      const rr = r * (en.uid === s.focus ? 1.15 : 0.9);
      const d = shown.get(en.uid);
      d.hp = d.hp === undefined || dt <= 0 || dt > 0.5 ? en.hp : d.hp + (en.hp - d.hp) * (1 - Math.exp(-dt * 12));
      const head = heads["e" + en.uid];
      const cast = en.died === null ? enemyCastAt(en.uid, time) : null;
      if (cast) {
        const age = time - cast.t, ic = 44 * u;
        const top = head ? head.y - 14 * u : p.y - rr - 18 * u;
        og.globalAlpha = Math.max(0, Math.min(1, (1.1 - age) / 0.3));
        drawIcon(og, iconRow(en.champ), SLOT_COL[cast.s], (head ? head.x : p.x) - ic / 2, top - ic, ic, false);
        og.strokeStyle = SLOT_COLORS[cast.s]; og.lineWidth = 2 * u;
        og.strokeRect((head ? head.x : p.x) - ic / 2, top - ic, ic, ic);
        og.globalAlpha = 1;
        // The ability flying at you.
        const fly = (age - 0.15) / 0.35;
        if (fly > 0 && fly < 1.4) {
          const tx = meX, ty = meY - R * 0.6, k = Math.min(1, fly);
          const x0 = p.x, y0 = p.y - rr * 0.6, x1 = x0 + (tx - x0) * k, y1 = y0 + (ty - y0) * k;
          g.globalAlpha = Math.max(0, 1 - Math.max(0, fly - 1) / 0.4) * 0.9;
          g.strokeStyle = SLOT_COLORS[cast.s]; g.lineWidth = (cast.s === "R" ? 7 : 4) * u; g.lineCap = "round";
          g.beginPath(); g.moveTo(x0 + (x1 - x0) * Math.max(0, k - 0.35) / k, y0 + (y1 - y0) * Math.max(0, k - 0.35) / k); g.lineTo(x1, y1); g.stroke();
          g.lineCap = "butt"; g.globalAlpha = 1;
        }
      }
      if (head) {
        // Model: a ring at its feet, portrait and HP bar above its head.
        g.globalAlpha = Math.max(0, fade);
        g.strokeStyle = en.uid === s.focus ? "#f0605a" : "rgba(240,96,90,.55)"; g.lineWidth = 3 * u;
        g.beginPath(); g.ellipse(p.x, p.y, rr * 1.2, rr * 0.5, 0, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
        if (en.died === null) {
          const bw = rr * 2;
          drawIcon(og, iconRow(en.champ), 0, head.x - bw / 2 - 22 * u, head.y - 10 * u, 18 * u, true);
          hpBar(og, head.x - bw / 2, head.y - 4 * u, bw, d.hp / en.max, "#f0605a");
        }
        continue;
      }
      g.globalAlpha = Math.max(0, fade) * born;
      g.fillStyle = "rgba(240,96,90,.25)";
      g.beginPath(); g.arc(p.x, p.y, rr + 5 * u, 0, Math.PI * 2); g.fill();
      if (en.died !== null) g.filter = "grayscale(1)";
      drawIcon(g, iconRow(en.champ), 0, p.x - rr, p.y - rr, rr * 2, true);
      g.filter = "none";
      g.strokeStyle = en.uid === s.focus ? "#f0605a" : "rgba(240,96,90,.6)"; g.lineWidth = 3 * u;
      g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.stroke();
      hpBar(og, p.x - rr, p.y - rr - 14 * u, rr * 2, d.hp / en.max, "#f0605a");
      if (en.died !== null) {
        g.strokeStyle = "#f4f4f4"; g.lineWidth = 5 * u;
        g.beginPath(); g.moveTo(p.x - rr * 0.6, p.y - rr * 0.6); g.lineTo(p.x + rr * 0.6, p.y + rr * 0.6);
        g.moveTo(p.x + rr * 0.6, p.y - rr * 0.6); g.lineTo(p.x - rr * 0.6, p.y + rr * 0.6); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // You.
    const frac = s.selfHp / fight.maxHp;
    const myHead = heads.me;
    let labelY = meY + R + 30 * u;
    if (myHead) {
      g.strokeStyle = s.dead ? "rgba(120,120,120,.6)" : "#8fd3ff"; g.lineWidth = 3 * u;
      g.beginPath(); g.ellipse(meX, meY, R * 1.2, R * 0.5, 0, 0, Math.PI * 2); g.stroke();
      hpBar(og, myHead.x - R, myHead.y - 4 * u, R * 2, frac, frac < 0.3 ? "#f0605a" : "#5fd38a");
      labelY = meY + R * 0.5 + 26 * u;
    } else {
      g.fillStyle = s.dead ? "rgba(120,120,120,.2)" : "rgba(143,211,255,.18)";
      g.beginPath(); g.arc(meX, meY, R + 7 * u, 0, Math.PI * 2); g.fill();
      if (s.dead || s.cc) g.filter = s.dead ? "grayscale(1) brightness(.5)" : "saturate(.4)";
      drawIcon(g, champ.row, 0, meX - R, meY - R, R * 2, true);
      g.filter = "none";
      g.strokeStyle = "#8fd3ff"; g.lineWidth = 3 * u;
      g.beginPath(); g.arc(meX, meY, R, 0, Math.PI * 2); g.stroke();
      hpBar(og, meX - R, meY - R - 16 * u, R * 2, frac, frac < 0.3 ? "#f0605a" : "#5fd38a");
    }
    if (s.cc && !s.dead) {
      const cy = myHead ? myHead.y - 18 * u : meY - R - 30 * u;
      og.strokeStyle = "#b388ff"; og.lineWidth = 3 * u;
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + i * 2.1;
        og.beginPath(); og.arc(meX + Math.cos(a) * R * 0.8, cy + Math.sin(a) * 6 * u, 5 * u, 0, Math.PI * 2); og.stroke();
      }
      floatText(og, "STUNNED", meX, labelY, 1, "#b388ff", 15 * u);
    }
    if (s.dead) floatText(og, "SLAIN", meX, labelY, 1, "#f0605a", 18 * u);
    else if (time < fight.engage) floatText(og, "ENEMIES ENGAGE IN " + (fight.engage - time).toFixed(1) + " s", meX, labelY + (s.cc ? 18 * u : 0), 0.8, "#8295a8", 13 * u);

    // On-hit passives.
    for (const pr of fight.procs) {
      const age = time - pr.t;
      if (age < 0 || age > 0.4) continue;
      const p = posOf(pr.u);
      g.strokeStyle = SLOT_COLORS[pr.s]; g.globalAlpha = 1 - age / 0.4; g.lineWidth = 4 * u;
      g.beginPath(); g.arc(p.x, p.y, r + 10 * u + age * 40 * u, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    }

    // Damage numbers.
    for (const n of fight.numbers) {
      const age = time - n.t;
      if (age < 0 || age > 0.9 || n.a < 1) continue;
      const p = posOf(n.u);
      const head = heads["e" + n.u];
      const baseY = head ? head.y - 20 * u : p.y - r - 26 * u;
      const jitter = ((n.t * 997) % 1 - 0.5) * 50 * u;
      const size = (n.crit ? 26 : n.a > 400 ? 22 : 16) * u;
      floatText(overlay, Math.round(n.a).toString(), (head ? head.x : p.x) + jitter, baseY - age * 70 * u, 1 - age / 0.9,
        n.crit ? "#ffd36b" : TYPE_COLORS[n.x] || "#fff", size);
    }

    $("kills").textContent = s.kills;
    $("dmg").textContent = Math.round(s.damage).toLocaleString();
    $("state").textContent = s.dead ? "Slain" : s.cc ? "Crowd controlled" : "";
    return s;
  }

  function floatText(g, text, x, y, alpha, color, size) {
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.font = `600 ${size}px "Geist Mono", ui-monospace, monospace`;
    g.textAlign = "center";
    g.lineWidth = Math.max(2, size / 6); g.strokeStyle = "rgba(0,0,0,.8)"; g.strokeText(text, x, y);
    g.fillStyle = color; g.fillText(text, x, y);
    g.globalAlpha = 1;
  }

  // ---------- timeline ----------
  const track = $("track"), tc = $("trackCanvas"), tg = tc.getContext("2d");
  function drawTrack() {
    if (!fight) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = track.getBoundingClientRect();
    tc.width = Math.round(rect.width * dpr); tc.height = Math.round(rect.height * dpr);
    const W = tc.width, H = tc.height, X = (s) => (s / fight.duration) * W;
    tg.clearRect(0, 0, W, H);
    tg.fillStyle = "#14171b"; tg.fillRect(0, 0, W, H);
    for (const c of fight.cc) { tg.fillStyle = "rgba(179,136,255,.35)"; tg.fillRect(X(c.t), 0, Math.max(2, X(c.a) - X(c.t)), H); }
    // Your HP line.
    tg.strokeStyle = "#f0605a"; tg.lineWidth = 1.5 * dpr; tg.beginPath();
    tg.moveTo(0, H * 0.1);
    for (const e of fight.self) tg.lineTo(X(e.t), H * (0.1 + 0.8 * (1 - e.hp / fight.maxHp)));
    tg.stroke();
    for (const c of fight.casts) {
      tg.fillStyle = SLOT_COLORS[c.s];
      const row = "QWER".indexOf(c.s);
      tg.fillRect(X(c.t), H * (0.2 + row * 0.16), Math.max(2 * dpr, X(c.a || 0.1)), H * 0.12);
    }
    tg.fillStyle = "#f4f4f4";
    for (const k of fight.kills) { tg.beginPath(); tg.arc(X(k.t), H * 0.1, 3 * dpr, 0, Math.PI * 2); tg.fill(); }
    if (fight.death) { tg.fillStyle = "#f0605a"; tg.fillRect(X(fight.death.t) - dpr, 0, 2 * dpr, H); }
    tg.fillStyle = "rgba(237,237,237,.45)"; tg.fillRect(X(fight.engage), 0, dpr, H);
  }
  function drawPlayhead() {
    drawTrack();
    const W = tc.width, H = tc.height, x = (t / fight.duration) * W;
    tg.fillStyle = "rgba(10,16,23,.45)"; tg.fillRect(x, 0, W - x, H);
    tg.fillStyle = "#ededed"; tg.fillRect(x - 1, 0, 3, H);
  }
  function seek(ev) {
    const r = track.getBoundingClientRect();
    t = Math.max(0, Math.min(fight.duration, ((ev.clientX - r.left) / r.width) * fight.duration));
    shown.clear();
  }
  let dragging = false;
  track.addEventListener("pointerdown", (e) => { dragging = true; track.setPointerCapture(e.pointerId); seek(e); });
  track.addEventListener("pointermove", (e) => { if (dragging) seek(e); });
  track.addEventListener("pointerup", () => { dragging = false; });

  // ---------- 3D models ----------
  let modelMode = false;
  function attachModels() {
    const M = window.Models3D;
    if (!M || M.arena || !M.attach($("arena3d"))) return;
    if (champ) setupModels();
  }
  window.addEventListener("models3d-ready", attachModels);
  attachModels();
  function setupModels() {
    const M = window.Models3D;
    if (!M || !M.ok || !champ) return;
    const id = champ.id;
    M.setFight(id, trace.fight.team).then((ok) => {
      if (!champ || champ.id !== id) return;
      modelMode = ok;
      video.pause();
      $("clipVideo").hidden = ok;
      $("clipNote").textContent = ok
        ? "Click an ability (or press Q, W, E, R) and your champion casts it in the arena."
        : "No model for this champion yet, so casts play Riot's ability preview instead.";
    });
  }
  // Ability button or key: the model's animation, or the clip without a model.
  function showAbility(slot) {
    if (modelMode) { showCaption(slot); window.Models3D.previewRole(slot); playSound(champ, slot, 1); }
    else playClip(slot);
  }

  // ---------- ability and death sounds ----------
  // With the 3D models, each cast plays its ability's sound and each death the champion's death sound.
  // replay-data/sounds/ holds them taken from the game's own sound banks (tools/build_game_sounds.py),
  // all joined into one file. Without it, casts fall back to the first burst of sound in Riot's
  // preview video of the ability (tools/build_sounds.py), streamed from Riot's CDN, and deaths are silent.
  // Browsers only allow sound after the first click or key.
  let soundOn = true, gestured = false, soundFiles = {};
  fetch(DATA + "sounds/sounds.json" + BUST).then((r) => (r.ok ? r.json() : {})).then((m) => { soundFiles = m; }).catch(() => {});
  // A few audio players reused round robin. Each is started once inside the first click or
  // key press, which lets it play later from the animation loop (Safari needs this per player).
  const voices = [];
  let nextVoice = 0;
  function silentWav() {
    const n = 400, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
    v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, "data"); v.setUint32(40, n, true); b.fill(128, 44);
    return "data:audio/wav;base64," + btoa(String.fromCharCode(...b));
  }
  function unlockVoices() {
    const silent = silentWav();
    for (let i = 0; i < 6; i++) {
      const a = new Audio(silent);
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
      voices.push(a);
    }
  }
  function playSound(c, slot, volume) {
    if (!soundOn || !gestured || !voices.length || !c) return;
    const packed = soundFiles.clips && soundFiles.clips[c.id] && soundFiles.clips[c.id][slot];
    const video = !soundFiles.clips && slot !== "D" && c.sound && c.sound[slot];
    if (!packed && !video) return;
    const k = String(c.key).padStart(4, "0");
    const a = voices[nextVoice++ % voices.length];
    a.pause();
    a.src = packed ? `${DATA}sounds/${soundFiles.file}${BUST}#t=${packed[0]},${packed[0] + packed[1]}`
      : `${index.clip_cdn}/${k}/ability_${k}_${slot}1.webm#t=${video[0]},${video[0] + video[1]}`;
    a.volume = volume * 0.8;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
    // Media fragments stop late in some browsers; end the clip on time so it never runs into the next one.
    clearTimeout(a.stopTimer);
    a.onplaying = packed ? () => { clearTimeout(a.stopTimer); a.stopTimer = setTimeout(() => a.pause(), packed[1] * 1000); } : null;
  }
  function syncSound() {
    video.muted = !(soundOn && gestured);
    if (!soundOn) for (const a of voices) a.pause();
    const b = $("sound");
    b.textContent = soundOn ? "Sound on" : "Sound off";
    b.setAttribute("aria-pressed", String(soundOn));
  }
  for (const type of ["pointerdown", "keydown"])
    window.addEventListener(type, () => { if (!gestured) { gestured = true; unlockVoices(); syncSound(); } }, { capture: true });

  // ---------- ability clips ----------
  const video = $("video");
  const clipState = { slot: null, start: 0, end: 0, startedAt: 0 };
  function setupClip() {
    const local = index.local_clips && champ.clip;
    $("fallback").hidden = true;
    if (local) video.src = DATA + "clips/" + champ.id + ".mp4";
    else video.removeAttribute("src");
    showCaption("Q");
    video.pause();
    if (!modelMode) $("clipNote").textContent = "Each cast plays Riot's official preview of that ability. Click an ability to watch it again.";
  }
  function clipUrl(slot) {
    const k = String(champ.key).padStart(4, "0");
    return `${index.clip_cdn}/${k}/ability_${k}_${slot}1.webm`;
  }
  function showCaption(slot) {
    $("clipChip").textContent = slot;
    $("clipChip").style.background = SLOT_COLORS[slot];
    $("clipName").textContent = (champ.spells && champ.spells[slot]) || slot;
    for (const b of document.querySelectorAll(".ab")) b.classList.toggle("lit", b.dataset.slot === slot);
  }
  function playClip(slot) {
    showCaption(slot);
    clipState.slot = slot;
    clipState.startedAt = performance.now();
    const fb = $("fallback");
    const showFallback = (msg) => {
      fb.hidden = false; fb.textContent = "";
      const c = document.createElement("canvas"); c.width = c.height = 96; c.className = "big";
      paintIcon(c, champ.row, SLOT_COL[slot], 96);
      const p = document.createElement("div"); p.textContent = msg;
      fb.append(c, p);
    };
    if (index.local_clips) {
      const seg = champ.clip && champ.clip[slot];
      if (!seg) { video.pause(); showFallback("Riot has no preview clip for this ability."); return; }
      fb.hidden = true;
      clipState.start = seg[0]; clipState.end = seg[0] + seg[1] - 0.05;
      video.currentTime = seg[0];
    } else {
      fb.hidden = true;
      clipState.start = 0; clipState.end = Infinity;
      video.src = clipUrl(slot);
      video.onerror = () => showFallback("The preview clip couldn't be loaded.");
    }
    video.playbackRate = 1;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }
  video.addEventListener("timeupdate", () => { if (video.currentTime >= clipState.end) video.pause(); });
  // A new cast takes over the clip once the current one has had a moment, or at once for an ultimate.
  function maybeClip(slot) {
    if (modelMode) { showCaption(slot); return; }
    const playedFor = (performance.now() - clipState.startedAt) / 1000;
    const busy = clipState.slot && !video.paused && playedFor < 1.2;
    if (!busy || (slot === "R" && clipState.slot !== "R")) playClip(slot);
  }

  function renderAbilities() {
    const box = $("abilities"); box.textContent = "";
    for (const slot of "QWER") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ab"; b.dataset.slot = slot;
      b.title = `${slot}: ${(champ.spells || {})[slot] || ""}. Click to see it.`;
      const c = document.createElement("canvas"); c.width = c.height = 128;
      paintIcon(c, champ.row, SLOT_COL[slot], 128);
      const cd = document.createElement("canvas"); cd.width = cd.height = 128; cd.className = "cd";
      const k = document.createElement("span"); k.className = "key"; k.textContent = slot; k.style.color = SLOT_COLORS[slot];
      b.append(c, cd, k);
      b.addEventListener("click", () => showAbility(slot));
      box.append(b);
    }
  }
  function drawCooldowns(time) {
    for (const b of document.querySelectorAll(".ab")) {
      const g = b.querySelector(".cd").getContext("2d");
      g.clearRect(0, 0, 128, 128);
      let last = null;
      for (const c of fight.casts) if (c.s === b.dataset.slot && c.t <= time) last = c;
      const never = !fight.casts.some((c) => c.s === b.dataset.slot);
      if (never) { g.fillStyle = "rgba(10,16,23,.7)"; g.fillRect(0, 0, 128, 128); continue; }
      if (!last || time >= last.next) continue;
      const p = (time - last.t) / Math.max(0.01, last.next - last.t);
      g.fillStyle = "rgba(10,16,23,.65)";
      g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 100, -Math.PI / 2 + p * Math.PI * 2, Math.PI * 1.5); g.closePath(); g.fill();
    }
  }

  // ---------- side panels ----------
  function renderBuild() {
    const b = $("build"); b.textContent = "";
    for (const it of trace.build.items) { const s = document.createElement("span"); s.textContent = it.name; b.append(s); }
    for (const a of trace.build.augments) { const s = document.createElement("span"); s.className = "aug"; s.textContent = a.name; b.append(s); }
    const sm = trace.summary, f = trace.fight;
    const st = [
      ["Average DPS", Math.round(sm.mean_dps).toLocaleString()],
      ["Survives", Math.round(sm.survival_rate * 100) + "%"],
      ["Kills / min", sm.kills_per_minute.toFixed(1)],
      ["This fight", f.duration.toFixed(1) + " s"],
      ["Enemy team", f.team.join(", ")],
    ];
    const box = $("stats"); box.textContent = "";
    for (const [k, v] of st) {
      const d = document.createElement("div");
      const s = document.createElement("small"); s.textContent = k;
      const bb = document.createElement("b"); bb.textContent = v;
      if (k === "Enemy team") { bb.style.fontSize = "13px"; d.style.gridColumn = "1 / -1"; }
      d.append(s, bb); box.append(d);
    }
  }
  function renderBars(s) {
    const box = $("bars");
    if (!box.childElementCount) {
      trace.sources.forEach((name, i) => {
        const row = document.createElement("div"); row.className = "bar";
        const label = document.createElement("span"); label.textContent = name;
        const fill = document.createElement("div"); fill.className = "fill";
        const bar = document.createElement("i"); bar.style.background = SOURCE_COLORS[i]; fill.append(bar);
        const v = document.createElement("b");
        row.append(label, fill, v); box.append(row);
      });
    }
    const max = Math.max(1, ...s.bySource);
    [...box.children].forEach((row, i) => {
      row.querySelector("i").style.width = (100 * s.bySource[i] / max).toFixed(1) + "%";
      row.querySelector("b").textContent = Math.round(s.bySource[i]).toLocaleString();
    });
  }

  // ---------- main loop ----------
  function frame(now) {
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (fight) {
      const before = t;
      if (playing && !dragging) {
        t = Math.min(fight.duration, t + dt * speed);
        if (t >= fight.duration) { playing = false; $("play").textContent = "Play"; }
        // Clips for casts that started during this frame.
        let latest = null;
        for (const c of fight.casts) if (c.t > before && c.t <= t) latest = !latest || c.s === "R" ? c : latest;
        if (latest) maybeClip(latest.s);
        if (modelMode) {
          for (const c of fight.casts) if (c.t > before && c.t <= t) playSound(champ, c.s, 1);
          for (const [uid, list] of fight.enemyCasts)
            for (const c of list) if (c.t > before && c.t <= t) {
              const sp = fight.spawns.get(uid);
              playSound(sp && byId.get(String(sp.x).toLowerCase()), c.s, 0.45);
            }
          if (fight.death && fight.death.t > before && fight.death.t <= t) playSound(champ, "D", 1);
          for (const k of fight.kills) if (k.t > before && k.t <= t) {
            const sp = fight.spawns.get(k.u);
            playSound(sp && byId.get(String(sp.x).toLowerCase()), "D", 0.6);
          }
        }
      }
      const s = drawArena(t, reduceMotion ? 0 : dt);
      drawPlayhead();
      drawCooldowns(t);
      renderBars(s);
      $("now").textContent = t.toFixed(1);
    }
    requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  $("champ").addEventListener("change", (e) => load(e.target.value));
  $("rand").addEventListener("click", () => {
    const opts = $("champ").options;
    const pick = opts[Math.floor(Math.random() * opts.length)].value;
    $("champ").value = pick; load(pick);
  });
  $("play").addEventListener("click", () => {
    if (!fight) return;
    if (t >= fight.duration) { t = 0; shown.clear(); }
    playing = !playing;
    $("play").textContent = playing ? "Pause" : "Play";
    if (!playing) video.pause();
  });
  $("restart").addEventListener("click", () => { t = 0; shown.clear(); playing = true; $("play").textContent = "Pause"; });
  $("speed").addEventListener("change", (e) => { speed = parseFloat(e.target.value); });
  $("sound").addEventListener("click", () => { soundOn = !soundOn; syncSound(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); $("play").click(); }
    else if (e.key === "ArrowRight" && fight) { t = Math.min(fight.duration, t + 1); shown.clear(); }
    else if (e.key === "ArrowLeft" && fight) { t = Math.max(0, t - 1); shown.clear(); }
    else if ("qwer".includes(e.key.toLowerCase()) && e.key.length === 1 && champ) showAbility(e.key.toUpperCase());
  });
  window.addEventListener("resize", drawTrack);
})();
