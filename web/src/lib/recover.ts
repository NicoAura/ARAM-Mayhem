// After a new version of the site goes live, a tab opened before it can ask for script files that
// no longer exist. Reloading picks up the new version; the timestamp stops a reload loop.
const KEY = "deeparam-reloaded";

export const isStaleChunk = (e: Error) => /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch/i.test(`${e.name} ${e.message}`);

export function reloadOnce(): boolean {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

export function clearReloadFlag() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
