// 3D champion models for the fight replay (three.js). Each fighter in the arena is an
// animated model posed from the simulated timeline (cast, attack, stunned, death, idle), with
// the game's own clip order for each ability and idle variations (replay-data/anims.json). Models come from
// replay-data/models/, built by tools/build_models.mjs; a champion with no built model (the
// website, which doesn't ship Riot art) loads the full model from modelviewer.lol instead,
// picking its clips here the same way. If WebGL or a model is missing,
// replay.js keeps drawing the 2D portraits.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const DATA = "replay-data/models/";
const BUST = "?v=" + (window.REPLAY_VERSION || "0");
const HEIGHT = 2.6;              // world units for a champion of average size
const FALLBACK = { Q: ["attack"], W: ["attack"], E: ["attack"], R: ["attack"], crit: ["attack"],
  stunned: ["idle"], death: ["idle"], attack: ["idle"], run: ["idle"] };

let manifest = null;
const manifestReady = fetch(DATA + "models.json" + BUST).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  .then((m) => { manifest = {}; for (const [k, v] of Object.entries(m)) manifest[k.toLowerCase()] = v; });
const keysReady = fetch("replay-data/index.json" + BUST).then((r) => r.json())
  .then((idx) => new Map(idx.champions.map((c) => [c.id.toLowerCase(), { id: c.id, key: c.key }]))).catch(() => new Map());
// How each champion animates, from the game's animation graphs (tools/build_anim_data.py):
// idle variations, death, and each ability's clips in order, one list per successive cast.
let anims = {};
const animsReady = fetch("replay-data/anims.json" + BUST).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  .then((a) => { for (const [k, v] of Object.entries(a)) anims[k.toLowerCase()] = v; });
const SOURCE = "https://cdn.modelviewer.lol/lol/models";
const FADE = 0.15;               // seconds to blend from one clip into the next
const LOOPS = /loop|channel|_idle$|hold/i;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Same rules as pickClips in tools/build_models.mjs: animation names vary by champion
// (Spell4 vs Spell4_NoMove, Idle1 vs Idle_Base, Zed_idle1.anm), so try exact names first.
function pickClips(names) {
  const clean = (n) => n.replace(/\.anm$/i, "").toLowerCase();
  const list = names.map((n) => ({ n, c: clean(n) }));
  const transition = (c) => /_to_|to_?idle|to_?run|2idle|2run|_in\d*$|idle_?in|run_?in|lead_?in|leadout|intro|enter|exit|winddown|wndup|windup|_back$/.test(c);
  const find = (...patterns) => {
    for (const p of patterns) {
      const hit = list.find(({ c }) => (p instanceof RegExp ? p.test(c) : c === p) && !transition(c));
      if (hit) return hit.n;
    }
    return null;
  };
  const spell = (k) => find(`spell${k}`, `spell${k}_base`, `spell${k}_cast`, `spell${k}a`, `spell${k}_nomove`,
    new RegExp(`^spell${k}(_|$)`), new RegExp(`(^|_)spell${k}(_base|_cast)?$`), new RegExp(`spell${k}`));
  return {
    idle: find("idle1", "idle_base", "idle", /^idle/, /(^|_)idle0?1(_base)?$/, /(^|_)idle\d*(_base|v\d)?$/),
    run: find("run_base", "run", "run1", /^run(?!_homeguard|_slow)/, /(^|_)run(1|_base)?$/),
    attack: find("attack1", "attack_1", /^attack/, /(^|_)attack_?1$/, /(^|_)attack\d*$/),
    crit: find("crit1", "crit", /^crit/, /(^|_)crit(_base)?$/),
    Q: spell(1), W: spell(2), E: spell(3), R: spell(4),
    stunned: find("stunned", "stun", /stun/),
    death: find("death", /^death/, /(^|_)death/),
  };
}

function loadRemote(key) {
  return keysReady.then((keys) => {
    const c = keys.get(key);
    if (!c) return null;
    return loader.loadAsync(`${SOURCE}/${key}/${c.key * 1000}/model.glb`)
      .then((g) => ({ gltf: g, entry: { clips: pickClips(g.animations.map((a) => a.name)) } }));
  });
}
const gltfs = new Map();         // champion id (lower case) -> Promise<gltf | null>

function loadChampion(id) {
  const key = String(id).toLowerCase();
  if (!gltfs.has(key)) {
    gltfs.set(key, Promise.all([manifestReady, animsReady]).then(() => {
      const entry = manifest[key];
      if (!entry) return loadRemote(key).then((g) => g && { ...g, anim: anims[key] }).catch(() => null);
      // A ".txt" file is the same .glb in base64, for hosts that only serve text.
      const load = entry.file.endsWith(".txt")
        ? fetch(DATA + entry.file + BUST).then((r) => r.text()).then((b64) => {
          const bin = atob(b64.trim()), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return loader.parseAsync(bytes.buffer, DATA);
        })
        : loader.loadAsync(DATA + entry.file + BUST);
      return load.then((g) => ({ gltf: g, entry, anim: anims[key] })).catch(() => null);
    }));
  }
  return gltfs.get(key);
}

// One posed copy of a champion model.
class Actor {
  constructor({ gltf, entry, anim }) {
    this.group = new THREE.Group();
    this.root = cloneSkinned(gltf.scene);
    this.group.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = {};
    for (const [role, name] of Object.entries(entry.clips)) {
      const clip = name && gltf.animations.find((a) => a.name === name);
      if (clip) this.clips[role] = { action: this.mixer.clipAction(clip), duration: clip.duration, name };
    }
    // The game's own clip lists, where the model has those clips. A clip is named either after
    // the graph ("Spell1A") or the .anm file ("riven_spell1a", "Zed_spell1.anm").
    const byName = new Map();
    for (const a of gltf.animations) byName.set(a.name.toLowerCase().replace(/\.anm$/, ""), a);
    const one = (alts) => {
      for (const n of alts.split("|")) {
        const a = byName.get(n.toLowerCase());
        if (a) return { action: this.mixer.clipAction(a), duration: a.duration, name: a.name };
      }
      return null;
    };
    const seq = (list) => { const out = (list || []).map(one).filter(Boolean); return out.length ? out : null; };
    this.seq = {};
    if (anim) {
      const idles = (anim.idle || []).map(seq).filter(Boolean).map((x) => x[x.length - 1]);
      if (idles.length) this.seq.idle = idles;
      if (seq(anim.death)) this.seq.death = [seq(anim.death)];
      for (const k of ["Q", "W", "E", "R"]) {
        const casts = ((anim[k] || {}).casts || []).map(seq).filter(Boolean);
        if (casts.length) this.seq[k] = casts;
      }
    }
    this.current = null;
    this.prev = null;
    // Parts the game hides (Teemo's mushroom, Ornn's poro) start hidden; some clips show or
    // hide parts partway through (submeshVisibilityEvents on the skeleton, frames at 30 fps).
    this.meshes = [];
    this.events = {};
    this.rootBone = null;
    this.root.traverse((o) => {
      if (o.isBone && !this.rootBone) this.rootBone = o;
      if (o.isMesh) {
        o.frustumCulled = false;
        const ud = o.material.userData || {};
        this.meshes.push({ mesh: o, hash: ud.hash, shown: ud.visible !== false });
      }
      if (o.userData && o.userData.submeshVisibilityEvents) this.events = o.userData.submeshVisibilityEvents;
    });
    // Scale to a common height with the feet on the ground, measured on the visible parts
    // in the idle pose.
    this.pose("idle", 0, true);
    // Some clips carry root motion (Teemo's Q runs forward, Garen's Q starts in the air);
    // the arena places each fighter itself, so the root bone stays where idle has it.
    this.rootRest = this.rootBone ? this.rootBone.position.clone() : null;
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of this.meshes) if (m.shown) box.union(new THREE.Box3().setFromObject(m.mesh, true));
    if (box.isEmpty()) box.setFromObject(this.root, true);
    const h = Math.max(1e-6, box.max.y - box.min.y);
    const s = HEIGHT / h;
    this.root.scale.multiplyScalar(s);
    this.root.position.y = -box.min.y * s;
    this.root.position.x = -((box.max.x + box.min.x) / 2) * s;
    this.root.position.z = -((box.max.z + box.min.z) / 2) * s;
    this.height = h * s;
  }
  clip(role) {
    if (this.clips[role]) return this.clips[role];
    for (const r of FALLBACK[role] || []) if (this.clips[r]) return this.clips[r];
    return this.clips.idle || Object.values(this.clips)[0] || null;
  }
  // Which clip plays for a role at time t, and where in it: an ability's clips in order (the
  // last one looping if it is a channel), idle variations now and then, else the single clip.
  choose(role, t, loop, n) {
    const casts = this.seq[role];
    if (casts && role !== "idle") {
      const list = casts[(n || 0) % casts.length];
      let at = Math.max(0, t);
      for (let i = 0; i < list.length; i++) {
        const c = list[i], d = Math.max(1e-3, c.duration);
        if (i === list.length - 1) {
          const loops = LOOPS.test(c.name) || loop;
          return { c, time: loops ? at % d : Math.min(at, d - 1e-3) };
        }
        if (at < d) return { c, time: at };
        at -= d;
      }
    }
    if (role === "idle" && this.seq.idle) {
      // The main idle three times, then the next variation once, round and round; worked out
      // from t so scrubbing shows the same pose.
      const [base, ...vars] = this.seq.idle;
      const bd = Math.max(1e-3, base.duration);
      if (!vars.length) return { c: base, time: ((t % bd) + bd) % bd };
      const period = vars.map((v) => 3 * bd + v.duration);
      const total = period.reduce((a, b) => a + b, 0);
      let at = ((t % total) + total) % total;
      for (let i = 0; i < vars.length; i++) {
        if (at < 3 * bd) return { c: base, time: at % bd };
        at -= 3 * bd;
        if (at < vars[i].duration) return { c: vars[i], time: at };
        at -= vars[i].duration;
      }
      return { c: base, time: 0 };
    }
    const c = this.clip(role);
    if (!c) return null;
    const d = Math.max(1e-3, c.duration);
    return { c, time: loop ? ((t % d) + d) % d : Math.min(Math.max(0, t), d - 1e-3) };
  }
  // Total length of an ability's clips for its n-th cast (0 if the model has none).
  castLength(role, n) {
    const casts = this.seq[role];
    if (!casts) return this.duration(role);
    return casts[(n || 0) % casts.length].reduce((a, c) => a + c.duration, 0);
  }
  // Shows the role's clip at time t, blending briefly from the previous clip.
  pose(role, t, loop, n) {
    const pick = this.choose(role, t, loop, n);
    if (!pick) return 0;
    const { c, time } = pick;
    const now = performance.now() / 1000;
    if (this.current !== c) {
      if (this.prev && this.prev.c !== c) this.prev.c.action.stop();
      if (this.current) this.prev = { c: this.current, time: this.current.action.time, at: now };
      c.action.reset().play();
      this.current = c;
    }
    let w = 1;
    if (this.prev) {
      w = Math.min(1, (now - this.prev.at) / FADE);
      if (w >= 1 || this.prev.c === c) { if (this.prev.c !== c) this.prev.c.action.stop(); this.prev = null; w = 1; }
      else { this.prev.c.action.enabled = true; this.prev.c.action.setEffectiveWeight(1 - w); this.prev.c.action.time = this.prev.time; }
    }
    c.action.setEffectiveWeight(w);
    c.action.time = time;
    this.mixer.update(0);
    if (this.rootRest) this.rootBone.position.copy(this.rootRest);
    this.showParts(c.name, c.action.time * 30);
    return c.duration;
  }
  showParts(clipName, frame) {
    const vis = new Map(this.meshes.map((m) => [m.hash, m.shown]));
    for (const e of this.events[clipName] || []) {
      const on = e.endFrame != null ? frame >= (e.startFrame || 0) && frame <= e.endFrame : frame >= (e.startFrame || 0);
      if (!on) continue;
      for (const h of e.hideSubmeshList || []) vis.set(h, false);
      for (const h of e.showSubmeshList || []) vis.set(h, true);
    }
    for (const m of this.meshes) m.mesh.visible = vis.get(m.hash) !== false;
  }
  duration(role) { const c = this.clip(role); return c ? c.duration : 0; }
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

const api = {
  ok: false,
  arena: null,
  actors: new Map(),             // key -> {actor, champ}
  pendingKeys: new Set(),
  preview: null,

  attach(arenaCanvas) {
    try {
      this.arena = { renderer: makeRenderer(arenaCanvas), scene: new THREE.Scene(),
        camera: new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100) };
      this.arena.camera.position.set(0, 11, 11);
      this.arena.camera.lookAt(0, 0, 0);
      this.ok = true;
    } catch (e) {
      this.ok = false;
    }
    return this.ok;
  },

  // Starts loading a fight's models. Resolves to whether your champion has a model.
  setFight(champId, enemyIds) {
    for (const [, a] of this.actors) this.arena.scene.remove(a.actor.group);
    this.actors.clear();
    this.pendingKeys.clear();
    this.preview = null;
    for (const id of new Set(enemyIds)) loadChampion(id);
    return loadChampion(champId).then((g) => !!g);
  },
  hasModel(champId) { return !!(manifest && manifest[String(champId).toLowerCase()]); },

  // Click on an ability: your champion plays it once in the arena.
  // Clicking the same ability again plays its next cast (Riven's Q: A, B, C).
  previewRole(role) {
    const last = this.lastPreview;
    const n = last && last.role === role ? last.n + 1 : 0;
    this.preview = this.lastPreview = { role, start: performance.now(), n };
  },
  // Length of a fighter's n-th cast of an ability, once its model is loaded (0 before).
  castLength(key, role, n) {
    const e = this.actors.get(key);
    return e ? e.actor.castLength(role, n) : 0;
  },

  // Converts canvas pixels (device px) to a point on the arena floor.
  toWorld(px, py, W, H) {
    const ndc = new THREE.Vector2((px / W) * 2 - 1, -(py / H) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.arena.camera);
    const p = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return p;
  },
  toScreen(v, W, H) {
    const p = v.clone().project(this.arena.camera);
    return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H };
  },

  // fighters: [{key, champ, x, y, face: 1 | -1, role, t, loop, visible}] in device px.
  // Returns {key: {x, y}}, the point above each loaded model's head, so the 2D overlay can place HP bars.
  frame(fighters, W, H) {
    const out = {};
    if (!this.ok) return out;
    const { renderer, scene, camera } = this.arena;
    const cw = renderer.domElement.width, ch = renderer.domElement.height;
    if (cw !== W || ch !== H) renderer.setSize(W, H, false);
    // Keep the floor 16 units wide whatever the canvas shape.
    const aspect = H / W;
    camera.left = -8; camera.right = 8; camera.top = 8 * aspect; camera.bottom = -8 * aspect;
    camera.updateProjectionMatrix();
    const seen = new Set();
    for (const f of fighters) {
      seen.add(f.key);
      let entry = this.actors.get(f.key);
      if (!entry || entry.champ !== f.champ) {
        if (entry) scene.remove(entry.actor.group);
        this.actors.delete(f.key);
        if (!this.pendingKeys.has(f.key + "|" + f.champ)) {
          this.pendingKeys.add(f.key + "|" + f.champ);
          loadChampion(f.champ).then((g) => {
            this.pendingKeys.delete(f.key + "|" + f.champ);
            if (!g || this.actors.has(f.key)) return;
            const actor = new Actor(g);
            this.actors.set(f.key, { actor, champ: f.champ });
            scene.add(actor.group);
          });
        }
        continue;
      }
      const a = entry.actor;
      a.group.visible = f.visible !== false;
      a.group.position.copy(this.toWorld(f.x, f.y, W, H));
      a.group.rotation.y = f.face > 0 ? Math.PI / 2 : -Math.PI / 2;
      a.group.scale.setScalar(f.scale || 1);
      let { role, t, loop, n } = f;
      if (f.key === "me" && this.preview) {
        const pt = (performance.now() - this.preview.start) / 1000;
        const pn = this.preview.n || 0;
        if (pt < a.castLength(this.preview.role, pn) + 0.2) { role = this.preview.role; t = pt; loop = false; n = pn; }
        else this.preview = null;
      }
      a.pose(role, t, loop, n);
      const head = this.toScreen(a.group.position.clone().add(new THREE.Vector3(0, a.height * (f.scale || 1) * 1.12, 0)), W, H);
      out[f.key] = head;
    }
    for (const [key, entry] of this.actors) if (!seen.has(key)) { scene.remove(entry.actor.group); this.actors.delete(key); }
    renderer.render(scene, camera);

    return out;
  },
};

window.Models3D = api;
window.dispatchEvent(new Event("models3d-ready"));
