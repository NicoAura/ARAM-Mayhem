import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import FeedbackBox from "@/components/FeedbackBox";
import PageTransitions from "@/components/PageTransitions";
import TiltEffects from "@/components/TiltEffects";
import SwipeGestures from "@/components/SwipeGestures";
import CompareTray from "@/components/CompareTray";
import HoverPreview from "@/components/HoverPreview";
import CountUp from "@/components/CountUp";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import HeaderScroll from "@/components/HeaderScroll";
import FirstVisitTour from "@/components/FirstVisitTour";
import AccountButton from "@/components/AccountButton";
import BrandMark from "@/components/BrandMark";
import MobileTabBar from "@/components/MobileTabBar";
import NavLinks from "@/components/NavLinks";
import SearchPalette from "@/components/SearchPalette";
import ErrorReporter from "@/components/ErrorReporter";
import SettingsMenu from "@/components/SettingsMenu";
import { text } from "@/lib/content";
import { searchPages } from "@/lib/highlights";
import { SETTINGS_SCRIPT } from "@/lib/settings";
import { THEME_COLORS, THEME_KEY } from "@/lib/theme";
import { navItems, navPages } from "@/lib/tabs";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });

const DESCRIPTION = "ARAM Mayhem tier list, augment win rates and a teamfight simulator for the current patch.";

export const metadata: Metadata = {
  metadataBase: new URL("https://deeparam.com"),
  title: "DeepARAM",
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  applicationName: "DeepARAM",
  openGraph: { type: "website", siteName: "DeepARAM", title: "DeepARAM", description: DESCRIPTION, url: "/", images: [{ url: "/og.png", width: 1200, height: 630, alt: "DeepARAM" }] },
  twitter: { card: "summary_large_image", title: "DeepARAM", description: DESCRIPTION, images: ["/og.png"] },
};

// Tells search engines the site's name and logo, so results show "DeepARAM" with the Augment Hex icon.
const STRUCTURED_DATA = JSON.stringify([
  { "@context": "https://schema.org", "@type": "WebSite", name: "DeepARAM", url: "https://deeparam.com/" },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "DeepARAM",
    url: "https://deeparam.com/",
    logo: "https://deeparam.com/icons/app/icon-512.png",
    email: "admin@deeparam.com",
  },
]);

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
// New visitors start in dark mode; "system" follows the device.
const THEME_SCRIPT = `var t="dark";try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})||"dark"}catch(e){}if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;`;

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
        <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT + THEME_SCRIPT + SETTINGS_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }} />
      </head>
      <body>
        <ErrorReporter />
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <BrandMark />
              <span>
                <span className="brand-deep">Deep</span>
                <b>ARAM</b>
              </span>
            </Link>
            <NavLinks items={[{ href: "/", label: "Home" }, ...navItems()]} />
            <SearchPalette pages={searchPages()} />
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
            <SettingsMenu />
            <AccountButton />
          </div>
        </header>
        {text("banner") && <p className="site-banner">{text("banner")}</p>}
        <main>{children}</main>
        <footer className="site-footer">
          <FeedbackBox />
          <nav className="footer-links" aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:admin@deeparam.com">Contact</a>
          </nav>
          <p>{text("footer")}</p>
        </footer>
        <PageTransitions />
        <TiltEffects />
        <SwipeGestures />
        <CompareTray />
        <HoverPreview />
        <CountUp />
        <KeyboardShortcuts />
        <HeaderScroll />
        <FirstVisitTour />
        <MobileTabBar tabs={navPages().map(({ href, label }) => ({ href, label }))} />
      </body>
    </html>
  );
}
