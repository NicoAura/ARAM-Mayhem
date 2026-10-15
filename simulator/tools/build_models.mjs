// Shrinks animated champion models for the replay viewer: keeps the clips the
// replay plays (idle, run, attacks, Q/W/E/R, stunned, death), drops the rest,
// resizes textures to WebP and compresses geometry with meshopt.
//
// Source models: temporarily the exports from modelviewer.lol, until they are
// replaced with files exported from a local League install. Riot assets; don't commit them.
//
//   npm install --prefix /tmp/gltf @gltf-transform/cli@4 @gltf-transform/core@4 \
//       @gltf-transform/extensions@4 meshoptimizer
//   NODE_PATH=/tmp/gltf/node_modules node tools/build_models.mjs --index viewer/replay-data/index.json \
//       --out viewer/replay-data/models [--only Yunara,Ahri] [--cache ~/.cache/aram-mayhem-sim/models]
//
// Writes <out>/<ChampionId>.glb and <out>/models.json ({id: {file, clips: {idle, run, attack, crit, Q, W, E, R, stunned, death}}}).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer");
const CLI = (() => {
  let dir = path.dirname(require.resolve("@gltf-transform/cli"));
  while (!fs.existsSync(path.join(dir, "bin", "cli.js"))) dir = path.dirname(dir);
  return path.join(dir, "bin", "cli.js");
})();

const SOURCE = "https://cdn.modelviewer.lol/lol/models";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const cache = (args.cache || path.join(os.homedir(), ".cache/aram-mayhem-sim/models")).replace(/^~/, os.homedir());
const out = args.out || "viewer/replay-data/models";
const index = JSON.parse(fs.readFileSync(args.index || "viewer/replay-data/index.json", "utf8"));
const only = args.only ? new Set(String(args.only).toLowerCase().split(",")) : null;
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(out, { recursive: true });

// Picks the clip for each role from the animation names in the model. Names vary by
// champion (Spell4 vs Spell4_NoMove, Idle1 vs Idle_Base, Zed_idle1.anm, PunkGenius_Idle01.anm),
// so try exact names first, then the same words after a champion or skin prefix.
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

async function fetchModel(champ) {
  const file = path.join(cache, `${champ.id}.glb`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const url = `${SOURCE}/${champ.id.toLowerCase()}/${champ.key * 1000}/model.glb`;
  // curl rather than fetch so HTTPS_PROXY is honoured.
  try {
    execFileSync("curl", ["-sfL", "-A", "aram-mayhem-sim", "-o", file + ".part", url]);
  } catch (e) {
    fs.rmSync(file + ".part", { force: true });
    throw new Error(`${url}: download failed`);
  }
  fs.renameSync(file + ".part", file);
  return file;
}

async function build(io, champ) {
  const src = await fetchModel(champ);
  const doc = await io.read(src);
  const root = doc.getRoot();
  const clips = pickClips(root.listAnimations().map((a) => a.getName()));
  const keep = new Set(Object.values(clips).filter(Boolean));
  for (const a of root.listAnimations()) if (!keep.has(a.getName())) a.dispose();
  const trimmed = path.join(cache, `${champ.id}.trimmed.glb`);
  await io.write(trimmed, doc);
  // glTF-Transform's optimize joins accessors (most of the size is per-joint
  // animation accessors), resamples clips, makes textures WebP and compresses with meshopt.
  const dst = path.join(out, `${champ.id}.glb`);
  execFileSync(process.execPath, [CLI, "optimize", trimmed, dst, "--compress", "meshopt", "--texture-compress", "webp",
    "--texture-size", "512", "--simplify", "false"], { stdio: "ignore" });
  fs.rmSync(trimmed);
  return { file: `${champ.id}.glb`, bytes: fs.statSync(dst).size, clips };
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder,
});
const manifestPath = path.join(out, "models.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const todo = index.champions.filter((c) => !only || only.has(c.id.toLowerCase()));
let done = 0;
for (const champ of todo) {
  try {
    manifest[champ.id] = await build(io, champ);
    const m = manifest[champ.id];
    const missing = Object.entries(m.clips).filter(([, v]) => !v).map(([k]) => k);
    console.log(`${++done}/${todo.length} ${champ.id} ${(m.bytes / 1e6).toFixed(2)} MB` + (missing.length ? ` (no ${missing.join(", ")})` : ""));
  } catch (e) {
    console.log(`${++done}/${todo.length} ${champ.id} skipped: ${e.message}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}
