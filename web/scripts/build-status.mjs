// Writes src/data/status.json for the /status page: when each part of the site's data last changed.
// Runs before every build and dev start. Dates come from the data files themselves and, where the
// checkout has history, from the last commit that touched each folder.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const json = (p) => {
  try {
    return JSON.parse(readFileSync(join(repo, p), "utf8"));
  } catch {
    return null;
  }
};
const git = (...args) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};
const shallow = git("rev-parse", "--is-shallow-repository") !== "false";
const changed = (...paths) => (shallow ? null : git("log", "-1", "--format=%cI", "--", ...paths) || null);
const ymd = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s ?? null);

const meta = json("data/cn/augments.json")?.meta ?? {};
let patch = null;
try {
  const rows = readFileSync(join(repo, "data/cn/history/patches.csv"), "utf8").trim().split("\n");
  const [p, , , , last, days] = rows[rows.length - 1].split(",");
  patch = { patch: p, lastDay: last, days: Number(days) };
} catch {}
const tracker = json("data/pbe/tracker.json") ?? {};
const sim = json("simulator/viewer/replay-data/index.json") ?? {};

const status = {
  built: new Date().toISOString(),
  stats: {
    updated: meta.fetched_at ?? changed("data/cn"),
    through: ymd(meta.champion_stat_date) ?? patch?.lastDay ?? null,
    patch: patch?.patch ?? null,
    days: patch?.days ?? null,
  },
  pbe: {
    updated: changed("data/pbe") ?? tracker.dataAsOf ?? null,
    through: tracker.dataAsOf ?? null,
    build: tracker.builds?.pbe ?? null,
    changes: Object.values(tracker.counts ?? {}).reduce((a, b) => a + b, 0) || null,
  },
  simulator: {
    updated: changed("simulator/data", "simulator/viewer/replay-data", "simulator/src"),
    patch: sim.game_version ?? null,
  },
};

const out = join(web, "src/data/status.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(status, null, 2) + "\n");
console.log(`status: stats ${status.stats.updated}, PBE ${status.pbe.updated}, simulator ${status.simulator.updated}`);
