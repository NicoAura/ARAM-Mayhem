"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname.startsWith(t.href) ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
