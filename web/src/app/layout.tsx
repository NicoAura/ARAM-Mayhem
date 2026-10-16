import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import MobileTabBar from "@/components/MobileTabBar";
import NavLinks from "@/components/NavLinks";
import { allTabs } from "@/lib/tabs";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "DeepARAM",
  description: "DeepARAM: ARAM Mayhem stats, damage simulator and PBE changes",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Phones and tablets on iOS or Android get the mobile layout (bottom tab bar, compact header).
// Desktop browsers keep the regular layout at any window size. iPadOS reports itself as a Mac,
// so a Mac with a touch screen counts as iOS. Runs before paint so the layout doesn't jump.
const DEVICE_SCRIPT = `try{var u=navigator.userAgent;if(/iPhone|iPad|iPod|Android/i.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1))document.documentElement.dataset.device="mobile"}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} />
      </head>
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
        <MobileTabBar tabs={allTabs().map(({ href, label }) => ({ href, label }))} />
      </body>
    </html>
  );
}
