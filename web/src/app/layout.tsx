import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARAM Mayhem",
  description: "ARAM Mayhem stats, damage simulator and PBE changes",
};

const sections = [
  { href: "/stats", label: "Stats" },
  { href: "/simulator", label: "Simulator" },
  { href: "/pbe", label: "PBE" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            ARAM Mayhem
          </Link>
          <nav>
            {sections.map((s) => (
              <Link key={s.href} href={s.href}>
                {s.label}
              </Link>
            ))}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
