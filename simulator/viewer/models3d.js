// 3D champion models for the fight replay (three.js). Each fighter in the arena is an
// animated model posed from the simulated timeline (cast, attack, stunned, death, idle). Models come from
// replay-data/models/, built by tools/build_models.mjs; a champion with no built model (the
// website, which doesn't ship Riot art) loads the full model from modelviewer.lol instead,
// picking its clips here the same way. If WebGL or a model is missing,
// replay.js keeps drawing the 2D portraits.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { pickClips } from "./clips.js";

const DATA = "replay-data/models/";
const BUST = "?v=" + (window.REPLAY_VERSION || "0");
const HEIGHT = 2.6;              // world units for a champion of average size
const FADE = 0.15;               // seconds to blend from one clip into the next
const RETURN = 0.35;             // seconds to glide back to the fighter's spot after a dash
const MAX_SHIFT = HEIGHT * 1.6;  // furthest an ability's own movement can carry a model
const SPELLS = new Set(["Q", "W", "E", "R"]);
const lengths = new Map();       // champion id (lower case) -> {slot: seconds} once loaded
const FALLBACK = { Q: ["attack"], W: ["attack"], E: ["attack"], R: ["attack"], crit: ["attack"],
  stunned: ["idle"], death: ["idle"], attack: ["idle"], run: ["idle"] };

let manifest = null;
const manifestReady = fetch(DATA + "models.json" + BUST).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  .then((m) => { manifest = {}; for (const [k, v] of Object.entries(m)) manifest[k.toLowerCase()] = v; });
const keysReady = fetch("replay-data/index.json" + BUST).then((r) => r.json())
  .then((idx) => new Map(idx.champions.map((c) => [c.id.toLowerCase(), { id: c.id, key: c.key }]))).catch(() => new Map());
const SOURCE = "https://cdn.modelviewer.lol/lol/models";
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

function loadRemote(key) {
  return keysReady.then((keys) => {
    const c = keys.get(key);
    if (!c) return null;
    return loader.loadAsync(`${SOURCE}/${key}/${c.key * 1000}/model.glb`)
      .then((g) => ({ gltf: g, entry: pickClips(g.animations.map((a) => a.name)) }));
  });
}
const gltfs = new Map();         // champion id (lower case) -> Promise<gltf | null>

function loadChampion(id) {
  const key = String(id).toLowerCase();
  if (!gltfs.has(key)) {
    gltfs.set(key, manifestReady.then(() => {
      const entry = manifest[key];
      if (!entry) return loadRemote(key).catch(() => null);
      // A ".txt" file is the same .glb in base64, for hosts that only serve text.
      const load = entry.file.endsWith(".txt")
        ? fetch(DATA + entry.file + BUST).then((r) => r.text()).then((b64) => {
          const bin = atob(b64.trim()), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return loader.parseAsync(bytes.buffer, DATA);
        })
        : loader.loadAsync(DATA + entry.file + BUST);
      return load.then((g) => ({ gltf: g, entry })).catch(() => null);
    }).then((g) => {
      if (g) lengths.set(key, castLengths(g));
      return g;
    }));
  }
  return gltfs.get(key);
}

// How long each ability's animation runs: its main clip plus the clip that eases it back to idle.
function castLengths({ gltf, entry }) {
  const dur = (name) => { const a = name && gltf.animations.find((c) => c.name === name); return a ? a.duration : 0; };
  const out = {};
  for (const slot of SPELLS) out[slot] = dur(entry.clips[slot]) + dur((entry.after || {})[slot]);
  return out;
}

// One posed copy of a champion model.
class Actor {
  constructor({ gltf, entry }) {
    this.group = new THREE.Group();
    this.root = cloneSkinned(gltf.scene);
    this.group.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    const make = (name) => {
      const clip = name && gltf.animations.find((a) => a.name === name);
      return clip ? { action: this.mixer.clipAction(clip), duration: clip.duration, name } : null;
    };
    this.clips = {};
    for (const [role, name] of Object.entries(entry.clips)) { const c = make(name); if (c) this.clips[role] = c; }
    // Other versions of a move, played in turn, and the clips that finish abilities.
    this.variants = {};
    for (const [role, names] of Object.entries(entry.extra || {}))
      if (this.clips[role]) this.variants[role] = [this.clips[role], ...names.map(make).filter(Boolean)];
    this.after = {};
    for (const [slot, name] of Object.entries(entry.after || {})) { const c = make(name); if (c) this.after[slot] = c; }
    this.current = null;
    this.fade = null;            // {from, time, start}: the clip being blended out
    this.offset = new THREE.Vector3();
    this.leftAt = null;          // when the last ability with movement ended (ms)
    this.lastShift = new THREE.Vector3();
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
  // Which clip and time a role shows at time t. Idle plays its main loop twice, then one of
  // its variations; a looping attack takes turns between the attack clips; the n-th cast of
  // an ability uses the n-th version of it, then its finishing clip.
  pick(role, t, loop, n) {
    const main = this.clip(role);
    if (!main) return null;
    const vars = this.variants[role] || [main];
    if (loop && role === "idle" && vars.length > 1) {
      const seq = [];
      for (let i = 1; i < vars.length; i++) seq.push(main, main, vars[i]);
      const total = seq.reduce((sum, c) => sum + c.duration, 0);
      let x = ((t % total) + total) % total;
      for (const c of seq) { if (x < c.duration) return { c, time: x }; x -= c.duration; }
    }
    if (loop) {
      if (vars.length > 1) {
        const total = vars.reduce((sum, c) => sum + c.duration, 0);
        let x = ((t % total) + total) % total;
        for (const c of vars) { if (x < c.duration) return { c, time: x }; x -= c.duration; }
      }
      const d = Math.max(1e-3, main.duration);
      return { c: main, time: ((t % d) + d) % d };
    }
    const c = vars[(n || 0) % vars.length];
    const after = SPELLS.has(role) ? this.after[role] : null;
    if (after && t >= c.duration) return { c: after, time: Math.min(t - c.duration, after.duration - 1e-3) };
    return { c, time: Math.min(Math.max(0, t), c.duration - 1e-3) };
  }
  // Shows the role's clip at time t, blending briefly out of the previous clip, and works out
  // how far the ability's own movement (a dash, a leap) carries the model from its spot.
  pose(role, t, loop, n, now = performance.now()) {
    const p = this.pick(role, t, loop, n);
    if (!p) return 0;
    const { c, time } = p;
    if (this.current !== c) {
      if (this.fade) this.fade.from.action.stop();
      this.fade = this.current ? { from: this.current, time: this.current.action.time, start: now } : null;
      c.action.reset().play();
      this.current = c;
    }
    c.action.time = time;
    let w = 1;
    if (this.fade) {
      w = Math.min(1, (now - this.fade.start) / 1000 / FADE);
      if (w >= 1) { this.fade.from.action.stop(); this.fade = null; }
      else { this.fade.from.action.enabled = true; this.fade.from.action.time = this.fade.time; this.fade.from.action.setEffectiveWeight(1 - w); }
    }
    c.action.setEffectiveWeight(w);
    this.mixer.update(0);
    this.offset.set(0, 0, 0);
    if (this.rootRest) {
      // Ability clips keep their sideways root motion (capped); everything else stays on the spot.
      if (SPELLS.has(role) && !loop) {
        this.root.updateMatrixWorld(true);
        const moved = this.rootBone.getWorldPosition(new THREE.Vector3());
        this.rootBone.position.copy(this.rootRest);
        this.root.updateMatrixWorld(true);
        const rest = this.rootBone.getWorldPosition(new THREE.Vector3());
        this.offset.subVectors(moved, rest).setY(0);
        if (this.offset.length() > MAX_SHIFT) this.offset.setLength(MAX_SHIFT);
        this.lastShift.copy(this.offset);
        this.leftAt = null;
      } else {
        this.rootBone.position.copy(this.rootRest);
        if (this.lastShift.lengthSq() > 1e-6) {
          if (this.leftAt === null) this.leftAt = now;
          const k = Math.min(1, (now - this.leftAt) / 1000 / RETURN);
          this.offset.copy(this.lastShift).multiplyScalar(1 - k);
          if (k >= 1) this.lastShift.set(0, 0, 0);
        }
      }
    }
    this.showParts(c.name, time * 30);
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
  previewRole(role) {
    const n = this.preview && this.preview.role === role ? this.preview.n + 1 : 0;
    this.preview = { role, n, start: performance.now() };
  },
  // Seconds the ability's animation runs for a loaded champion, or 0 if not loaded yet.
  castLength(champId, slot) { return (lengths.get(String(champId).toLowerCase()) || {})[slot] || 0; },

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
        const len = (lengths.get(String(f.champ).toLowerCase()) || {})[this.preview.role] || a.duration(this.preview.role);
        if (pt < len + 0.2) { role = this.preview.role; t = pt; loop = false; n = this.preview.n; }
        else this.preview = null;
      }
      a.pose(role, t, loop, n);
      a.group.position.add(a.offset);
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
