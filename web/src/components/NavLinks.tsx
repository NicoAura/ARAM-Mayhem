"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "@/lib/sections";

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {sections.map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link key={s.href} href={s.href} className={active ? "nav-link active" : "nav-link"} data-accent={s.key}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
