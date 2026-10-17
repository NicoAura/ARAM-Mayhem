"use client";

import { useEffect, useState } from "react";

// The pages kept for offline use (public/sw.js), newest first, each named by its own title.
export default function OfflinePages() {
  const [pages, setPages] = useState<{ href: string; title: string }[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const cache = await caches.open("deeparam-pages-v1");
        const keys = [...(await cache.keys())].reverse().filter((k) => !/^\/(offline$|embed\/)/.test(new URL(k.url).pathname));
        const out = await Promise.all(
          keys.map(async (k) => {
            const html = (await (await cache.match(k))?.text()) ?? "";
            const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/\s*[|·–-]\s*DeepARAM\s*$/i, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'") || new URL(k.url).pathname;
            const u = new URL(k.url);
            return { href: u.pathname + u.search, title };
          }),
        );
        setPages(out);
      } catch {
        setPages([]);
      }
    })();
  }, []);

  if (!pages) return null;
  if (!pages.length) return <p className="patch-note">No pages are saved on this device yet. Pages you open while online are kept here for next time.</p>;
  return (
    <div className="rank plain offline-pages">
      {pages.map((p) => (
        <a key={p.href} href={p.href}>
          <span className="rank-name">{p.title}</span>
          <span className="rank-v">{p.href}</span>
        </a>
      ))}
    </div>
  );
}
