"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = { href: string; label: string };

// Bottom tab bar for phones and tablets. It is only shown when the inline script in the
// layout marks the page as running on iOS or Android (html[data-device="mobile"]).
const PRIMARY = ["/tier-list", "/champions", "/tools"];

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  "/tier-list": <path d="M5 19V11M10 19V6M15 19v-9M20 19V4" />,
  "/champions": (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
    </>
  ),
  "/tools": <path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.4L4.5 16.3a1.6 1.6 0 0 0 2.3 2.3l5.4-5.4a3.5 3.5 0 0 0 4.4-4.6l-2.1 2.1-2-.5-.5-2z" />,
  "/pbe": <path d="M9 4h6M10 4v5l-5 9a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 18l-5-9V4" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] ?? ICONS.more}
    </svg>
  );
}

export default function MobileTabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const primary = [{ href: "/", label: "Home" }, ...tabs.filter((t) => PRIMARY.includes(t.href))];
  const rest = tabs.filter((t) => !PRIMARY.includes(t.href));
  const moreActive = rest.some((t) => isActive(t.href));

  return (
    <>
      {open && <button type="button" className="sheet-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="sheet" hidden={!open} id="more-sheet">
        {rest.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isActive(t.href) ? "page" : undefined}>
            {t.label}
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
      <nav className="tabbar" aria-label="Sections">
        {primary.map((t) => (
          <Link key={t.href} href={t.href} aria-current={isActive(t.href) ? "page" : undefined}>
            <Icon name={t.href} />
            <span>{t.href === "/tier-list" ? "Tiers" : t.label}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="more-sheet"
          aria-current={moreActive ? "page" : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="more" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
