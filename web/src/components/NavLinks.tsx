"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BETA } from "@/lib/beta";

export default function NavLinks({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={(t.href === "/" ? pathname === "/" : pathname.startsWith(t.href)) ? "page" : undefined}>
          {t.label}
          {BETA.has(t.href) && <span className="beta">Beta</span>}
        </Link>
      ))}
    </nav>
  );
}
