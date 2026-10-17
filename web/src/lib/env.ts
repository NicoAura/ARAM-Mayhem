import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// A server secret or variable. On Cloudflare it comes from the Worker's bindings
// (Settings → Variables and Secrets); in `next dev`/`next start` from process.env.
export function serverEnv(name: string): string | undefined {
  try {
    const v = (getCloudflareContext().env as unknown as Record<string, unknown>)[name];
    if (typeof v === "string" && v) return v;
  } catch {
    // Not running on Cloudflare.
  }
  return process.env[name] || undefined;
}

/** Names (never values) of the Worker's bindings, to check where a secret ended up. */
export function bindingNames(): string[] {
  try {
    return Object.keys(getCloudflareContext().env as object).sort();
  } catch {
    return [];
  }
}

type D1Statement = {
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};
type D1 = {
  prepare(sql: string): { bind(...v: unknown[]): D1Statement };
  batch(statements: D1Statement[]): Promise<unknown>;
};

/** A D1 database binding (wrangler.jsonc), or null outside Cloudflare. */
export function d1(name: string): D1 | null {
  try {
    return ((getCloudflareContext().env as unknown as Record<string, unknown>)[name] as D1) ?? null;
  } catch {
    return null;
  }
}
