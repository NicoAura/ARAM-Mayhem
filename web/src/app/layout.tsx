import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import MobileTabBar from "@/components/MobileTabBar";
import NavLinks from "@/components/NavLinks";
import SearchPalette from "@/components/SearchPalette";
import ThemeToggle from "@/components/ThemeToggle";
import { text } from "@/lib/content";
import { searchItems } from "@/lib/highlights";
import { THEME_COLORS, THEME_KEY } from "@/lib/theme";
import { allTabs } from "@/lib/tabs";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "DeepARAM",
  description: "DeepARAM: ARAM Mayhem stats for the current patch and a damage simulator",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

// Phones and tablets on iOS or Android get the mobile layout (bottom tab bar, compact header).
// Desktop browsers keep the regular layout at any window size. iPadOS reports itself as a Mac,
// so a Mac with a touch screen counts as iOS. Runs before paint so the layout doesn't jump.
const DEVICE_SCRIPT = `try{var u=navigator.userAgent;if(/iPhone|iPad|iPod|Android/i.test(u)||(/Macintosh/.test(u)&&navigator.maxTouchPoints>1))document.documentElement.dataset.device="mobile"}catch(e){}`;

// The header's Light / Dark choice, applied before paint so the page doesn't flash the other theme.
const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

// The Ko-fi link Nico sets at /admin: a full ko-fi.com link or just the page name.
function kofiUrl() {
  const v = text("kofi").trim();
  if (!v) return "";
  const name = v.replace(/^(https?:\/\/)?(www\.)?ko-fi\.com\//i, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9_-]+$/.test(name) ? `https://ko-fi.com/${name}` : "";
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const kofi = kofiUrl();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT + THEME_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <BrandMark />
              <span>
                Deep<b>ARAM</b>
              </span>
            </Link>
            <NavLinks tabs={[{ href: "/", label: "Home" }, ...allTabs().map(({ href, label }) => ({ href, label }))]} />
            <SearchPalette items={searchItems()} />
            {kofi && (
              <a className="kofi-btn" href={kofi} target="_blank" rel="noreferrer" aria-label="Support DeepARAM on Ko-fi">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 8h13v5a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V8z" />
                  <path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" />
                  <path d="M10.5 15s-2.5-1.4-2.5-3a1.25 1.25 0 0 1 2.5-.4A1.25 1.25 0 0 1 13 12c0 1.6-2.5 3-2.5 3z" fill="currentColor" stroke="none" />
                </svg>
                <span>Ko-fi</span>
              </a>
            )}
            <ThemeToggle />
          </div>
        </header>
        {text("banner") && <p className="site-banner">{text("banner")}</p>}
        <main>{children}</main>
        <footer className="site-footer">{text("footer")}</footer>
        <MobileTabBar tabs={allTabs().map(({ href, label }) => ({ href, label }))} />
      </body>
    </html>
  );
}
