import type { Metadata } from "next";
import { Cinzel, Roboto_Flex } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import Ripple from "@/components/Ripple";
import { HexLogo } from "@/components/icons";
import "./globals.css";

const brand = Cinzel({ subsets: ["latin"], weight: ["700"], variable: "--font-brand" });
const body = Roboto_Flex({ subsets: ["latin"], variable: "--font-body" });

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
    <html lang="en" className={`${brand.variable} ${body.variable}`}>
      <body>
        <Ripple />
        <header className="top-app-bar">
          <Link href="/" className="brand ripple">
            <HexLogo className="brand-logo" />
            <span>ARAM Mayhem</span>
          </Link>
          <NavLinks variant="tabs" />
        </header>
        <main>{children}</main>
        <footer className="site-footer body-small">
          ARAM Mayhem isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot
          Games or anyone officially involved in producing or managing Riot Games properties.
        </footer>
        <NavLinks variant="bar" />
      </body>
    </html>
  );
}
