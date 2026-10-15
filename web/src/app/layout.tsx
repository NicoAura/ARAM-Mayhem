import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import { HexLogo } from "@/components/icons";
import "./globals.css";

const display = Cinzel({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "ARAM Mayhem",
  description: "ARAM Mayhem stats, damage simulator and PBE changes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="backdrop" aria-hidden="true">
          <span className="glow glow-gold" />
          <span className="glow glow-blue" />
          <span className="grid" />
        </div>
        <header className="site-header">
          <Link href="/" className="brand">
            <HexLogo className="brand-logo" />
            <span>ARAM Mayhem</span>
          </Link>
          <NavLinks />
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          ARAM Mayhem isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot
          Games or anyone officially involved in producing or managing Riot Games properties.
        </footer>
      </body>
    </html>
  );
}
