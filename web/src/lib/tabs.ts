import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoPath } from "./repo-data";
import { sections } from "./sections";

export type Tab = { href: string; label: string; body: string };
/** A header tab; one with `children` is a menu (Tools). */
export type NavItem = { href: string; label: string; body?: string; children?: NavItem[] };

// A folder in the repo becomes a tab when it holds a site-tab.json:
//   { "label": "Fun Tools", "description": "...", "entry": "index.html", "order": 10 }
// scripts/sync-embeds.mjs copies the folder to public/embed/<slug>/ and the tab embeds `entry`.
export type ToolTab = Tab & { slug: string; entry: string; order: number; folder: string };

const SKIP = new Set(["web", "node_modules", ".git", ".github"]);

// Where each embedded folder (by slug) is published. Anything not listed goes in the Tools menu.
const ROUTES: Record<string, string> = {
  champions: "/champions",
  guide: "/guide",
  fun: "/tools/lab",
  "cook-builds": "/tools/kitchen",
};
export const toolHref = (slug: string) => ROUTES[slug] ?? `/tools/${slug}`;

export function discoverToolTabs(): ToolTab[] {
  const root = repoPath("");
  const found: ToolTab[] = [];
  const visit = (dir: string, depth: number) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith(".") || SKIP.has(d.name)) continue;
      const folder = join(dir, d.name);
      const manifest = join(folder, "site-tab.json");
      if (existsSync(manifest)) {
        try {
          const m = JSON.parse(readFileSync(manifest, "utf8"));
          const slug = String(m.slug ?? d.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          found.push({
            slug,
            href: toolHref(slug),
            label: String(m.label ?? d.name),
            body: String(m.description ?? ""),
            entry: String(m.entry ?? "index.html"),
            order: Number(m.order ?? 100),
            folder: relative(root, folder),
          });
        } catch {
          console.warn(`Skipping ${manifest}: not valid JSON`);
        }
      } else if (depth < 2) visit(folder, depth + 1);
    }
  };
  visit(root, 1);
  return found.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function allTabs(): Tab[] {
  return [...sections, ...discoverToolTabs()];
}

const pick = (href: string): NavItem[] => {
  const t = allTabs().find((x) => x.href === href);
  return t ? [{ href: t.href, label: t.label, body: t.body }] : [];
};

/** The header's tabs: Tier List, Champions, Guide, a Tools menu (Simulator, The Lab, The Kitchen, ...), PBE.
 *  My Stats sits behind the account button instead. */
export function navItems(): NavItem[] {
  const more = discoverToolTabs().filter((t) => t.href.startsWith("/tools/") && t.href !== "/tools/simulator");
  const tools = [...pick("/tools/simulator"), ...more.flatMap((t) => pick(t.href))];
  return [
    ...pick("/tier-list"),
    ...pick("/champions"),
    ...pick("/guide"),
    ...(tools.length ? [{ href: "/tools", label: "Tools", children: tools }] : []),
    ...pick("/pbe"),
  ];
}

/** Every page in header order, menus flattened (search, home page). */
export const navPages = (): NavItem[] => navItems().flatMap((t) => t.children ?? [t]);
