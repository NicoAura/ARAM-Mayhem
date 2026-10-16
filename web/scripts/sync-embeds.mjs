// Copies static pages that other parts of the repo publish into public/embed/ so the
// site can serve them: the stats dashboard, the simulator's replay viewer, and any
// folder with a site-tab.json (see src/lib/tabs.ts). Missing sources are skipped and
// the matching tab explains what it is waiting for.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const out = join(web, "public", "embed");
const SKIP = new Set(["web", "node_modules", ".git", ".github"]);

const embeds = [
  { name: "dashboard", from: join(repo, "dashboard") },
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
for (const { name, from } of embeds) {
  if (!existsSync(from)) {
    console.log(`sync-embeds: ${name} not found, skipping`);
    continue;
  }
  cpSync(from, join(out, name), { recursive: true });
  console.log(`sync-embeds: copied ${name}`);
}
