import "server-only";
import { serverEnv } from "./env";
import { cleanContent, type Content } from "./content";
import bundled from "@/content/site.json";

// Backs the /admin editor. Two Cloudflare secrets:
//   ADMIN_PASSWORD  what Nico types to unlock the editor
//   GITHUB_TOKEN    fine-grained token with Contents read/write on NicoAura/DeepARAM only
// A save commits src/content/site.json to main; Workers Builds then redeploys the site.

const REPO = "NicoAura/DeepARAM";
const FILE = "web/src/content/site.json";
const BRANCH = "main";

export class AdminError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function checkPassword(given: string | null) {
  const want = serverEnv("ADMIN_PASSWORD");
  if (!want) throw new AdminError("The editor isn't set up yet: ADMIN_PASSWORD is missing.", 503);
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(given ?? "")), crypto.subtle.digest("SHA-256", enc.encode(want))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  if (diff !== 0) {
    await new Promise((r) => setTimeout(r, 800)); // slows down guessing
    throw new AdminError("Wrong password.", 401);
  }
}

function github(path: string, init?: RequestInit) {
  const token = serverEnv("GITHUB_TOKEN");
  if (!token) throw new AdminError("Saving isn't set up yet: GITHUB_TOKEN is missing.", 503);
  return fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "deeparam-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
}

const toBase64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromBase64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

/** The text as it is on main now (it can be newer than this deploy), plus the file version for saving. */
export async function loadContent(): Promise<{ content: Content; sha: string | null }> {
  if (!serverEnv("GITHUB_TOKEN")) return { content: cleanContent(bundled), sha: null };
  const res = await github(`contents/${FILE}?ref=${BRANCH}`);
  if (!res.ok) throw new AdminError(`GitHub returned ${res.status} reading the site text.`, 502);
  const file = (await res.json()) as { content: string; sha: string };
  return { content: cleanContent(JSON.parse(fromBase64(file.content))), sha: file.sha };
}

export async function saveContent(input: unknown, sha: string | null): Promise<string> {
  if (!sha) throw new AdminError("Saving isn't set up yet: GITHUB_TOKEN is missing.", 503);
  const body = JSON.stringify(cleanContent(input), null, 2) + "\n";
  const res = await github(`contents/${FILE}`, {
    method: "PUT",
    body: JSON.stringify({ message: "Edit site text from /admin", content: toBase64(body), sha, branch: BRANCH }),
  });
  if (res.status === 409 || res.status === 422) throw new AdminError("The text changed since you opened the editor. Reload to get the latest, then save again.", 409);
  if (!res.ok) throw new AdminError(`GitHub returned ${res.status} saving the site text.`, 502);
  const out = (await res.json()) as { content: { sha: string } };
  return out.content.sha;
}
