// Keeps a page's view in its address (?tab=, ?q=, ?sort=, ?patches=) so a copied link opens the same view.
// replaceState: changing a filter doesn't add a Back step.
export function setParams(values: Record<string, string | null>) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(history.state, "", url.pathname + url.search + url.hash);
}

export const getParam = (key: string) => new URLSearchParams(location.search).get(key);
