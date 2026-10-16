import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import NavLinks from "@/components/NavLinks";
import { allTabs } from "@/lib/tabs";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "DeepARAM",
  description: "DeepARAM: ARAM Mayhem stats, damage simulator and PBE changes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            DeepARAM
          </Link>
          <NavLinks tabs={allTabs().map(({ href, label }) => ({ href, label }))} />
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          DeepARAM isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot
          Games or anyone officially involved in producing or managing Riot Games properties.
        </footer>
      </body>
    </html>
  );
}
