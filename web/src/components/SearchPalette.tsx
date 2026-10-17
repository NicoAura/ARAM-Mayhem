"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SearchItem = { group: string; name: string; hint: string; href: string; icon?: string };

// Header search: ⌘K, Ctrl+K or / opens a palette that jumps to any page, champion or augment.
// The page only carries the page links; champions and augments load from /data/search.json the first
// time search is hovered, focused or opened, which keeps every page's first load small.
export default function SearchPalette({ pages }: { pages: SearchItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(pages);
  const [loaded, setLoaded] = useState<"no" | "loading" | "yes">("no");
  const load = useCallback(() => {
    if (loaded !== "no") return;
    setLoaded("loading");
    fetch("/data/search.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((all: SearchItem[]) => (setItems(all), setLoaded("yes")))
      .catch(() => setLoaded("no"));
  }, [loaded]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items.filter((i) => i.group === "Pages")).slice(0, 40);
  }, [items, query]);

  const show = useCallback(() => {
    setQuery("");
    setSel(0);
    setOpen(true);
  }, []);

  const go = (i: number) => {
    const it = shown[i];
    if (!it) return;
    setOpen(false);
    router.push(it.href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setSel(0);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        show();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    load();
  }, [open, load]);

  let group = "";
  return (
    <>
      <button type="button" className="search-btn" onClick={show} onPointerEnter={load} onFocus={load} title="Search champions, augments and pages">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4-4" />
        </svg>
        <span className="search-label">Search</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="palette-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="palette" role="dialog" aria-label="Search">
            <input
              ref={input}
              value={query}
              placeholder="Search a champion, augment or page"
              aria-label="Search"
              onChange={(e) => {
                setQuery(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => Math.min(s + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => Math.max(s - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(sel);
                }
              }}
            />
            <ul>
              {shown.length === 0 && <li className="palette-group">{loaded === "yes" ? "No matches" : "Loading…"}</li>}
              {shown.map((it, i) => {
                const head = it.group !== group ? (group = it.group) : null;
                return (
                  <li key={`${it.group}-${it.name}`}>
                    {head && <p className="palette-group">{head}</p>}
                    <button type="button" data-active={i === sel || undefined} onMouseEnter={() => setSel(i)} onClick={() => go(i)}>
                      {it.icon && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.icon} alt="" width={22} height={22} loading="lazy" />
                      )}
                      {it.name}
                      <span>{it.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
