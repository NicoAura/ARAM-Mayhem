"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/stats", label: "Stats" },
  { href: "/simulator", label: "Simulator" },
  { href: "/pbe", label: "PBE" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
