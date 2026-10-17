"use client";

import { useEffect, useRef, useState } from "react";

// Phone gestures. A sideways swipe switches the page's in-page tabs (SubTabs) or, on a page without
// them, moves to the neighbouring bottom-bar tab. Pull-to-refresh is added only in the installed app
// (standalone display), since browsers already have their own. Touch screens only.

const MIN_X = 70;
const EDGE = 24; // leave the screen edges to the system's back and forward gestures

// Don't take swipes that start on something that scrolls or drags sideways itself.
function ownsSideways(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches("input, select, textarea, canvas, iframe, video, [data-no-swipe], [draggable='true'], dialog")) return true;
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}

function switchTab(dir: 1 | -1) {
  const list = document.querySelector<HTMLElement>("main .subtab-list");
  if (list && list.offsetParent) {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const next = tabs[i + dir];
    if (next) {
      next.click();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    return;
  }
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".tabbar a")];
  const i = links.findIndex((a) => a.getAttribute("aria-current") === "page");
  if (i >= 0) links[i + dir]?.click();
}

export default function SwipeGestures() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let start: { x: number; y: number; t: number; sideways: boolean; top: boolean } | null = null;

    const down = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (start = null);
      const p = e.touches[0];
      const target = e.target as Element;
      start = {
        x: p.clientX,
        y: p.clientY,
        t: performance.now(),
        sideways: p.clientX > EDGE && p.clientX < innerWidth - EDGE && !ownsSideways(target),
        top: standalone && scrollY <= 0 && !target.closest("dialog, .sheet, [data-no-swipe]"),
      };
    };
    const move = (e: TouchEvent) => {
      if (!start?.top) return;
      const dy = e.touches[0].clientY - start.y;
      const dx = Math.abs(e.touches[0].clientX - start.x);
      if (dy <= 0 || dx > dy || scrollY > 0) {
        if (pullRef.current) setPull((pullRef.current = 0));
        return;
      }
      // Resist the further it goes, like the system's own.
      setPull((pullRef.current = Math.min(110, dy * 0.5)));
    };
    const up = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s) return;
      if (pullRef.current) {
        const go = pullRef.current >= 70;
        setPull((pullRef.current = 0));
        if (go) {
          setRefreshing(true);
          location.reload();
        }
        return;
      }
      const p = e.changedTouches[0];
      const dx = p.clientX - s.x;
      const dy = p.clientY - s.y;
      if (!s.sideways || performance.now() - s.t > 700 || Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (getSelection()?.toString()) return;
      switchTab(dx < 0 ? 1 : -1);
    };

    addEventListener("touchstart", down, { passive: true });
    addEventListener("touchmove", move, { passive: true });
    addEventListener("touchend", up, { passive: true });
    const cancel = () => {
      start = null;
      setPull((pullRef.current = 0));
    };
    addEventListener("touchcancel", cancel);
    return () => {
      removeEventListener("touchstart", down);
      removeEventListener("touchmove", move);
      removeEventListener("touchend", up);
      removeEventListener("touchcancel", cancel);
    };
  }, []);

  if (!pull && !refreshing) return null;
  const ready = pull >= 70 || refreshing;
  return (
    <div className="ptr" data-ready={ready || undefined} data-spin={refreshing || undefined} style={{ transform: `translate(-50%, ${refreshing ? 70 : pull}px)` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: `rotate(${pull * 3}deg)` }}>
        <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
      </svg>
    </div>
  );
}
