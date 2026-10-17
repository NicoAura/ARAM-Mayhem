"use client";

import { useEffect } from "react";

// Marks <html data-scrolled> once the page is scrolled, so the header (globals.css) can shrink and
// take on its frosted background and border. At the top of a page it sits taller and clear.

export default function HeaderScroll() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      raf = 0;
      const on = scrollY > 8;
      if (on !== (root.dataset.scrolled === "")) {
        if (on) root.dataset.scrolled = "";
        else delete root.dataset.scrolled;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      delete root.dataset.scrolled;
    };
  }, []);
  return null;
}
