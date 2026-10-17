// Shrinks animated champion models for the replay viewer: keeps the clips the
// replay plays (idle, run, attacks, Q/W/E/R, stunned, death, their variations and the
// clips that finish abilities; see viewer/clips.js, plus every clip anims.json names), drops the rest,
// resizes textures to WebP and compresses geometry with meshopt.
//
// Source models: temporarily the exports from modelviewer.lol, until they are
// replaced with files exported from a local League install. Riot assets; don't commit them.
//
//   npm install --prefix /tmp/gltf @gltf-transform/cli@4 @gltf-transform/core@4 \
//       @gltf-transform/extensions@4 meshoptimizer
//   NODE_PATH=/tmp/gltf/node_modules node tools/build_models.mjs --index viewer/replay-data/index.json \
//       --out viewer/replay-data/models [--only Yunara,Ahri] [--cache ~/.cache/deeparam-sim/models]
//
// Writes <out>/<ChampionId>.glb and <out>/models.json ({id: {file, scale, clips, extra, after}}: the clips as
// pickClips returns them, scale the game's size for the champion against the model's units).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { pickClips } from "../viewer/clips.js";

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
const cache = (args.cache || path.join(os.homedir(), ".cache/deeparam-sim/models")).replace(/^~/, os.homedir());
const out = args.out || "viewer/replay-data/models";
const index = JSON.parse(fs.readFileSync(args.index || "viewer/replay-data/index.json", "utf8"));
const only = args.only ? new Set(String(args.only).toLowerCase().split(",")) : null;
// Clips named by the game's animation graphs (viewer/replay-data/anims.json, from build_anim_data.py),
// lower case without ".anm": kept too, so the replay can play each ability's clips in order.
const animsFile = args.anims || path.join(path.dirname(args.index || "viewer/replay-data/index.json"), "anims.json");
const anims = fs.existsSync(animsFile) ? JSON.parse(fs.readFileSync(animsFile, "utf8")) : {};
function graphClips(id) {
  const names = new Set(), add = (alts) => { for (const n of alts.split("|")) names.add(n.toLowerCase()); };
  const a = anims[id] || {};
  for (const list of a.idle || []) list.forEach(add);
  (a.death || []).forEach(add);
  for (const k of ["Q", "W", "E", "R"]) for (const list of (a[k] || {}).casts || []) list.forEach(add);
  return names;
}
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(out, { recursive: true });

async function fetchModel(champ) {
  const file = path.join(cache, `${champ.id}.glb`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const url = `${SOURCE}/${champ.id.toLowerCase()}/${champ.key * 1000}/model.glb`;
  // curl rather than fetch so HTTPS_PROXY is honoured.
  try {
    execFileSync("curl", ["-sfL", "-A", "deeparam-sim", "-o", file + ".part", url]);
  } catch (e) {
    fs.rmSync(file + ".part", { force: true });
    throw new Error(`${url}: download failed`);
  }
  fs.renameSync(file + ".part", file);
  return file;
}

// How much bigger or smaller the game draws the champion than its model's own units
// (skinMeshProperties.skinScale of the base skin; Malphite 1.75, Cho'Gath 0.8), so the replay
// can show every champion at its in-game size.
const SKINS = "https://raw.communitydragon.org/latest/game/data/characters";
function skinScale(champ) {
  const file = path.join(cache, `${champ.id}.skin0.json`);
  if (!fs.existsSync(file)) {
    try {
      execFileSync("curl", ["-sfL", "-A", "deeparam-sim", "-o", file, `${SKINS}/${champ.id.toLowerCase()}/skins/skin0.bin.json`]);
    } catch (e) {
      fs.rmSync(file, { force: true });
      return 1;
    }
  }
  const m = fs.readFileSync(file, "utf8").match(/"skinScale"\s*:\s*([0-9.]+)/);
  return m ? Math.round(Number(m[1]) * 1000) / 1000 : 1;
}

async function build(io, champ) {
  const src = await fetchModel(champ);
  const doc = await io.read(src);
  const root = doc.getRoot();
  const { clips, extra, after } = pickClips(root.listAnimations().map((a) => a.getName()));
  // Where the game's graph lists a move's clips, the name-based extras for it aren't needed.
  const a = anims[champ.id] || {};
  if ((a.idle || []).length) delete extra.idle;
  for (const k of ["Q", "W", "E", "R"]) if (((a[k] || {}).casts || []).length) { delete extra[k]; delete after[k]; }
  const keep = new Set([...Object.values(clips), ...Object.values(extra).flat(), ...Object.values(after)].filter(Boolean));
  const graph = graphClips(champ.id);
  for (const a of root.listAnimations())
    if (!keep.has(a.getName()) && !graph.has(a.getName().toLowerCase().replace(/\.anm$/, ""))) a.dispose();
  const trimmed = path.join(cache, `${champ.id}.trimmed.glb`);
  await io.write(trimmed, doc);
  // glTF-Transform's optimize joins accessors (most of the size is per-joint
  // animation accessors), resamples clips, makes textures WebP and compresses with meshopt.
  const dst = path.join(out, `${champ.id}.glb`);
  execFileSync(process.execPath, [CLI, "optimize", trimmed, dst, "--compress", "meshopt", "--texture-compress", "webp",
    "--texture-size", String(args["texture-size"] || 512), "--simplify", "false"], { stdio: "ignore" });
  fs.rmSync(trimmed);
  return { file: `${champ.id}.glb`, bytes: fs.statSync(dst).size, scale: skinScale(champ), clips, extra, after };
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
