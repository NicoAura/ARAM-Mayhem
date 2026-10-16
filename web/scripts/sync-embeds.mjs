// Copies static pages that other parts of the repo publish into public/embed/ so the
// site can serve them: the stats dashboard, the simulator's replay viewer, and any
// folder with a site-tab.json (see src/lib/tabs.ts). Missing sources are skipped and
// the matching tab explains what it is waiting for.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const out = join(web, "public", "embed");
const SKIP = new Set(["web", "node_modules", ".git", ".github"]);

const embeds = [
  // My Stats starts empty on the site: a local match archive in dashboard/data/ is never shipped
  { name: "dashboard", from: join(repo, "dashboard"), exclude: ["data"] },
  { name: "simulator", from: join(repo, "simulator", "viewer") },
];

function discover(dir, depth) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".") || SKIP.has(d.name)) continue;
    const folder = join(dir, d.name);
    const manifest = join(folder, "site-tab.json");
    if (existsSync(manifest)) {
      try {
        const m = JSON.parse(readFileSync(manifest, "utf8"));
        const slug = String(m.slug ?? d.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        embeds.push({ name: slug, from: folder });
      } catch {
        console.warn(`sync-embeds: ${manifest} is not valid JSON, skipping`);
      }
    } else if (depth < 2) discover(folder, depth + 1);
  }
}
discover(repo, 1);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const { name, from, exclude = [] } of embeds) {
  if (!existsSync(from)) {
    console.log(`sync-embeds: ${name} not found, skipping`);
    continue;
  }
  const skip = exclude.map((d) => join(from, d));
  // Build scripts and notes stay in the repo; only the pages and their data are published.
  const tooling = (src) => /\.(py|md)$/.test(src) || src.includes("/__pycache__");
  cpSync(from, join(out, name), { recursive: true, filter: (src) => !tooling(src) && !skip.some((d) => src === d || src.startsWith(d + "/")) });
  console.log(`sync-embeds: copied ${name}`);
}

// Every image, sound, model, font and script the pages use is mirrored in public/assets/ (scripts/fetch_assets.py),
// so links to the outside copies are pointed at the site's own. Pages that already use /assets/ are left as they are.
// A rule with a third entry only applies when that file is in public/assets/ (in git, so in the deployed build):
// until the clips, models or three.js are committed there, pages keep loading them from the outside copy.
const LOCAL = [
  [/https:\/\/raw\.communitydragon\.org\//g, "/assets/cd/"],
  [/https:\/\/ddragon\.leagueoflegends\.com\/cdn\//g, "/assets/dd/"],
  [/https:\/\/d28xe8vt774jo5\.cloudfront\.net\/champion-abilities/g, "/assets/clips", "clips"],
  [/https:\/\/cdn\.modelviewer\.lol\/lol\/models/g, "/assets/models", "models/models.json"],
  [/https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//g, "/assets/lib/three-0.160.0/", "lib/three-0.160.0/build/three.module.js"],
  [/<link[^>]+rel="preconnect"[^>]+fonts\.g(?:oogleapis|static)\.com[^>]*>\s*/g, ""],
  [/https:\/\/fonts\.googleapis\.com\/css2\?[^"')\s]+/g, "/assets/fonts/fonts.css"],
];
const ACTIVE = LOCAL.filter(([, , needs]) => !needs || existsSync(join(web, "public", "assets", needs)));
const TEXT = /\.(html|js|mjs|css|json)$/;
function localize(dir) {
  let changed = 0;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) changed += localize(p);
    else if (TEXT.test(d.name)) {
      const before = readFileSync(p, "utf8");
      const after = ACTIVE.reduce((s, [re, to]) => s.replace(re, to), before);
      if (after !== before) (writeFileSync(p, after), changed++);
    }
  }
  return changed;
}
if (existsSync(join(web, "public", "assets", "manifest.json"))) console.log(`sync-embeds: pointed ${localize(out)} files at /assets`);
