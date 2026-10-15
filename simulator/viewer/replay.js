// Fight replay for the ARAM Mayhem simulator. Plays a traced fight (mayhem_sim --trace)
// on a canvas and shows Riot's official clip of each ability as it is cast.
// Data comes from replay-data/, built by tools/build_replay_assets.py.
(() => {
  "use strict";
  const DATA = "replay-data/";
  const SLOT_COLORS = { Q: "#4fc3f7", W: "#7bd88f", E: "#f4b860", R: "#e66ad2" };
  const TYPE_COLORS = { physical: "#f08a4b", magic: "#7aa2ff", true: "#f4f4f4" };
  const SOURCE_COLORS = ["#c9d6e2", SLOT_COLORS.Q, SLOT_COLORS.W, SLOT_COLORS.E, SLOT_COLORS.R, "#b9a3ff"];
  const SLOT_COL = { P: 1, Q: 2, W: 3, E: 4, R: 5 };
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  let index = null, traces = null, sprite = null, byId = new Map();
  let champ = null, trace = null, fight = null;
  let t = 0, playing = true, speed = 1, lastFrame = 0;
  const shown = new Map(); // enemy uid -> displayed {x, y, hp}

  // ---------- loading ----------
  Promise.all([
    fetch(DATA + "index.json").then((r) => r.json()),
    fetch(DATA + "traces.json").then((r) => r.json()),
    new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = DATA + "sprites.webp"; }),
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
  }).catch((err) => {
    $("title").textContent = "Replays could not be loaded";
    $("clipNote").textContent = "Build them with tools/build_replay_assets.py, then serve this folder over HTTP. (" + err + ")";
  });

  // ---------- one champion's fight ----------
  function load(id) {
    champ = byId.get(id.toLowerCase());
    trace = traces[champ.id];
    fight = prepare(trace);
    t = 0; playing = true; shown.clear(); clipState.slot = null;
    $("play").textContent = "Pause";
    $("title").textContent = champ.name + (champ.title ? ", " + champ.title : "");
    $("total").textContent = fight.duration.toFixed(1);
    try { history.replaceState(null, "", "#" + champ.id); } catch (e) { /* sandboxed */ }
    renderBuild();
    renderAbilities();
    setupClip();
    drawTrack();
  }

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
      list.forEach((c, i) => { c.next = i + 1 < list.length ? list[i + 1].t : f.duration; c.land = c.t + (c.a || 0); });
    // Crits on attacks: tag the matching damage number.
    for (const a of f.attacks) if (a.f) {
      const n = f.numbers.find((n) => n.u === a.u && Math.abs(n.t - a.t) < 1e-6 && n.src === 0);
      if (n) n.crit = true;
    }
    return f;
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
  function iconRow(champId) { const c = byId.get(String(champId).toLowerCase()); return c ? c.row : -1; }
  function drawIcon(g, row, col, x, y, size, round) {
    g.save();
    if (round) { g.beginPath(); g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); g.clip(); }
    if (row >= 0 && sprite) {
      const S = index.icon_size;
      g.drawImage(sprite, col * S, row * S, S, S, x, y, size, size);
    } else {
      g.fillStyle = "#24364a"; g.fillRect(x, y, size, size);
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
    if (arena.width !== w || arena.height !== h) { arena.width = w; arena.height = h; }
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
      if (miss && age > 0 && age < 0.6) floatText(g, "MISS", to.x, to.y - r - 30 * u - age * 40 * u, 1 - age / 0.6, "#c9d6e2", 18 * u);
    }

    // Enemies.
    for (const en of alive) {
      const p = posOf(en.uid);
      const born = ease((time - en.born) / 0.3);
      const fade = en.died !== null ? 1 - (time - en.died) / 0.8 : 1;
      g.globalAlpha = Math.max(0, fade) * born;
      const rr = r * (en.uid === s.focus ? 1.15 : 0.9);
      g.fillStyle = "rgba(240,96,90,.25)";
      g.beginPath(); g.arc(p.x, p.y, rr + 5 * u, 0, Math.PI * 2); g.fill();
      if (en.died !== null) g.filter = "grayscale(1)";
      drawIcon(g, iconRow(en.champ), 0, p.x - rr, p.y - rr, rr * 2, true);
      g.filter = "none";
      g.strokeStyle = en.uid === s.focus ? "#f0605a" : "rgba(240,96,90,.6)"; g.lineWidth = 3 * u;
      g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.stroke();
      const d = shown.get(en.uid);
      d.hp = d.hp === undefined || dt <= 0 || dt > 0.5 ? en.hp : d.hp + (en.hp - d.hp) * (1 - Math.exp(-dt * 12));
      hpBar(g, p.x - rr, p.y - rr - 14 * u, rr * 2, d.hp / en.max, "#f0605a");
      if (en.died !== null) {
        g.strokeStyle = "#f4f4f4"; g.lineWidth = 5 * u;
        g.beginPath(); g.moveTo(p.x - rr * 0.6, p.y - rr * 0.6); g.lineTo(p.x + rr * 0.6, p.y + rr * 0.6);
        g.moveTo(p.x + rr * 0.6, p.y - rr * 0.6); g.lineTo(p.x - rr * 0.6, p.y + rr * 0.6); g.stroke();
      }
      g.globalAlpha = 1;
    }

    // You.
    const meX = st.me.x + (posOf(s.focus).x - st.me.x) * 0.25 * lunge;
    g.fillStyle = s.dead ? "rgba(120,120,120,.2)" : "rgba(143,211,255,.18)";
    g.beginPath(); g.arc(meX, st.me.y, R + 7 * u, 0, Math.PI * 2); g.fill();
    if (s.dead || s.cc) g.filter = s.dead ? "grayscale(1) brightness(.5)" : "saturate(.4)";
    drawIcon(g, champ.row, 0, meX - R, st.me.y - R, R * 2, true);
    g.filter = "none";
    g.strokeStyle = "#8fd3ff"; g.lineWidth = 3 * u;
    g.beginPath(); g.arc(meX, st.me.y, R, 0, Math.PI * 2); g.stroke();
    const frac = s.selfHp / fight.maxHp;
    hpBar(g, meX - R, st.me.y - R - 16 * u, R * 2, frac, frac < 0.3 ? "#f0605a" : "#5fd38a");
    if (s.cc && !s.dead) {
      g.strokeStyle = "#b388ff"; g.lineWidth = 3 * u;
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + i * 2.1;
        g.beginPath(); g.arc(meX + Math.cos(a) * R * 0.8, st.me.y - R - 30 * u + Math.sin(a) * 6 * u, 5 * u, 0, Math.PI * 2); g.stroke();
      }
      floatText(g, "STUNNED", meX, st.me.y + R + 30 * u, 1, "#b388ff", 15 * u);
    }
    if (s.dead) floatText(g, "SLAIN", meX, st.me.y + R + 30 * u, 1, "#f0605a", 18 * u);
    else if (time < fight.engage) floatText(g, "ENEMIES ENGAGE IN " + (fight.engage - time).toFixed(1) + " s", meX, st.me.y + R + 30 * u, 0.8, "#8295a8", 13 * u);

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
      const jitter = ((n.t * 997) % 1 - 0.5) * 50 * u;
      const size = (n.crit ? 26 : n.a > 400 ? 22 : 16) * u;
      floatText(g, Math.round(n.a).toString(), p.x + jitter, p.y - r - 26 * u - age * 70 * u, 1 - age / 0.9,
        n.crit ? "#ffd36b" : TYPE_COLORS[n.x] || "#fff", size);
    }

    $("kills").textContent = s.kills;
    $("dmg").textContent = Math.round(s.damage).toLocaleString();
    $("state").textContent = s.dead ? "Slain" : s.cc ? "Crowd controlled" : "";
    return s;
  }

  function floatText(g, text, x, y, alpha, color, size) {
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.font = `700 ${size}px "Chakra Petch", system-ui, sans-serif`;
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
    tg.fillStyle = "#172331"; tg.fillRect(0, 0, W, H);
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
    tg.fillStyle = "rgba(143,211,255,.5)"; tg.fillRect(X(fight.engage), 0, dpr, H);
  }
  function drawPlayhead() {
    drawTrack();
    const W = tc.width, H = tc.height, x = (t / fight.duration) * W;
    tg.fillStyle = "rgba(10,16,23,.45)"; tg.fillRect(x, 0, W - x, H);
    tg.fillStyle = "#8fd3ff"; tg.fillRect(x - 1, 0, 3, H);
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
      drawIcon(c.getContext("2d"), champ.row, SLOT_COL[slot], 0, 0, 96, false);
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
    const playedFor = (performance.now() - clipState.startedAt) / 1000;
    const busy = clipState.slot && !video.paused && playedFor < 1.2;
    if (!busy || (slot === "R" && clipState.slot !== "R")) playClip(slot);
  }

  function renderAbilities() {
    const box = $("abilities"); box.textContent = "";
    for (const slot of "QWER") {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ab"; b.dataset.slot = slot;
      b.title = `${slot}: ${(champ.spells || {})[slot] || ""}. Click to watch it.`;
      const c = document.createElement("canvas"); c.width = c.height = 128;
      drawIcon(c.getContext("2d"), champ.row, SLOT_COL[slot], 0, 0, 128, false);
      const cd = document.createElement("canvas"); cd.width = cd.height = 128; cd.className = "cd";
      const k = document.createElement("span"); k.className = "key"; k.textContent = slot; k.style.color = SLOT_COLORS[slot];
      b.append(c, cd, k);
      b.addEventListener("click", () => playClip(slot));
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
  $("sound").addEventListener("click", (e) => {
    video.muted = !video.muted;
    e.currentTarget.textContent = video.muted ? "Sound off" : "Sound on";
    e.currentTarget.setAttribute("aria-pressed", String(!video.muted));
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); $("play").click(); }
    else if (e.key === "ArrowRight" && fight) { t = Math.min(fight.duration, t + 1); shown.clear(); }
    else if (e.key === "ArrowLeft" && fight) { t = Math.max(0, t - 1); shown.clear(); }
    else if ("qwer".includes(e.key.toLowerCase()) && e.key.length === 1 && champ) playClip(e.key.toUpperCase());
  });
  window.addEventListener("resize", drawTrack);
})();
