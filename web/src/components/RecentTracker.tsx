"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { addRecent, RECENT_PAGES } from "@/lib/recent";

// Records each champion, augment, item and patch page opened, with its heading and icon.
export default function RecentTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!RECENT_PAGES.test(pathname)) return;
    // Wait a beat so the new page's heading is on screen.
    const t = setTimeout(() => {
      // The heading without its small subtitle ("Jinx", not "Jinx ARAM Mayhem build").
      const h1 = document.querySelector("main h1")?.cloneNode(true) as HTMLElement | undefined;
      h1?.querySelectorAll(".champ-hero-sub").forEach((el) => el.remove());
      const title = (h1?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!title) return;
      const icon = document.querySelector<HTMLImageElement>("main .champ-hero-icon, main .aug-hero-icon")?.getAttribute("src") ?? undefined;
      addRecent({ href: pathname, title, icon, kind: pathname.split("/")[1] });
    }, 300);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
