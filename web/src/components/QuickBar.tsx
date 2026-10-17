"use client";

import { useEffect, useRef, useState } from "react";

// Champion pages: a slim bar that sticks under the header once the summary scrolls away, for jumping
// between the in-game essentials (skill order, build, augments) and the rest of the page. The part
// you're reading is highlighted. Only sections that exist on the page get a link.

type Spot = { id: string; label: string };

export default function QuickBar({ spots }: { spots: Spot[] }) {
  const [here, setHere] = useState<Spot[]>([]);
  const [active, setActive] = useState("");
  const [shown, setShown] = useState(false);
  const bar = useRef<HTMLElement>(null);

  // On a narrow screen, keep the current stop in view along the bar.
  useEffect(() => {
    const nav = bar.current;
    const a = nav?.querySelector<HTMLElement>("[aria-current]");
    if (nav && a) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
  }, [active]);

  useEffect(() => {
    const found = spots.filter((s) => document.getElementById(s.id));
    setHere(found);
    const header = document.querySelector(".site-header");
    const root = document.documentElement;
    const place = () => root.style.setProperty("--quickbar-top", `${header?.getBoundingClientRect().height ?? 0}px`);
    place();
    const ro = header ? new ResizeObserver(place) : null;
    if (header) ro!.observe(header);

    // Shown once the hero's bottom passes under the header.
    const hero = document.querySelector(".champ-hero");
    const heroIo = hero ? new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0)) : null;
    if (hero) heroIo!.observe(hero);

    // The section nearest the top of the screen is the one you're reading.
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const first = found.find((s) => visible.has(s.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const s of found) io.observe(document.getElementById(s.id)!);
    return () => {
      ro?.disconnect();
      heroIo?.disconnect();
      io.disconnect();
      root.style.removeProperty("--quickbar-top");
    };
  }, [spots]);

  if (here.length < 2) return null;
  return (
    <nav ref={bar} className="quickbar" data-shown={shown || undefined} aria-label="Jump to">
      {here.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? "true" : undefined}
          onClick={(e) => {
            const el = document.getElementById(s.id);
            if (!el) return;
            e.preventDefault();
            el.scrollIntoView({ behavior: document.documentElement.dataset.motion === "reduce" ? "auto" : "smooth", block: "start" });
            history.replaceState(null, "", `#${s.id}`);
          }}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
