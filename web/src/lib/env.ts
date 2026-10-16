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
