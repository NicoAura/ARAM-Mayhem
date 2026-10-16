import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import Link from "next/link";
import Intro from "@/components/Intro";
import { BETA } from "@/lib/beta";
import { navItems } from "@/lib/tabs";

export const metadata: Metadata = pageMeta("/tools", "Tools", "ARAM Mayhem simulators, calculators and build experiments.");

// The Tools menu as a page, for phones and for links to /tools.
export default function ToolsPage() {
  const tools = navItems().find((t) => t.href === "/tools")?.children ?? [];
  return (
    <>
      <Intro eyebrow="Tools" title="Simulators, calculators and builds." />
      <div className="rank links tools-list">
        {tools.map((t) => (
          <Link key={t.href} href={t.href}>
            <span className="rank-name">
              {t.label}
              {BETA.has(t.href) && <span className="beta">Beta</span>}
            </span>
            <span className="rank-body">{t.body}</span>
            <span className="rank-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
