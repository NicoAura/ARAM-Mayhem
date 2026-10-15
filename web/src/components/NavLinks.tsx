"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "@/lib/sections";
import SectionIcon from "./SectionIcon";

// Rendered twice: as tabs in the top app bar, and as the bottom navigation bar on phones.
export default function NavLinks({ variant }: { variant: "tabs" | "bar" }) {
  const pathname = usePathname();
  return (
    <nav className={variant === "tabs" ? "nav-tabs" : "nav-bar"} aria-label="Sections">
      {sections.map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`nav-item ripple${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-indicator">
              <SectionIcon section={s.key} className="nav-icon" />
            </span>
            <span className="nav-label">{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
