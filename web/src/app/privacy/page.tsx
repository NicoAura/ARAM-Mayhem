import type { Metadata } from "next";
import Intro from "@/components/Intro";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("/privacy", "Privacy", "What DeepARAM stores about you, and what it doesn't.");

const CONTACT = "admin@deeparam.com";

export default function Privacy() {
  return (
    <>
      <Intro eyebrow="Privacy" title="What DeepARAM keeps, and what it doesn't." />
      <article className="card prose">
        <p>Last updated October 16, 2026.</p>
        <h2>No accounts, no tracking</h2>
        <p>
          DeepARAM has no user accounts, no passwords, no ads and no tracking cookies. We count page visits anonymously,
          without cookies, to see which pages are used. We don&apos;t sell or share personal data.
        </p>
        <h2>Stored in your browser</h2>
        <p>
          Your theme, settings and, if you sign in, your Riot ID and region are saved in your own browser&apos;s local storage.
          They never leave your device except as described below. Signing out or clearing site data removes them.
        </p>
        <h2>Riot ID lookups</h2>
        <p>
          When you sign in with a Riot ID, the site looks up that public profile (name, icon, level and rank) from Riot Games
          and shows it to you. Riot IDs are public, so this does not prove who you are. We don&apos;t keep a list of who looked
          up what.
        </p>
        <h2>My Stats</h2>
        <p>My Stats reads your games through a companion app on your own computer. Those games stay on your computer.</p>
        <h2>Server logs and security</h2>
        <p>
          Like any website, our hosting provider keeps short-lived request logs (IP address, page and time) and runs security
          checks to keep the site running and stop abuse, such as limiting how often Riot ID lookups can be made.
        </p>
        <h2>Contact</h2>
        <p>
          Questions or removal requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </article>
    </>
  );
}
