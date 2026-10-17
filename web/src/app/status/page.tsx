import type { Metadata } from "next";
import Link from "next/link";
import Freshness from "@/components/Freshness";
import Intro from "@/components/Intro";
import status from "@/data/status.json";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("/status", "Site Status", "When DeepARAM's ARAM Mayhem stats, PBE changes and Simulator were last updated.");

const day = (s: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

export default function StatusPage() {
  const { stats, pbe, simulator, built } = status;
  const rows = [
    {
      name: "Live stats",
      href: "/tier-list",
      at: stats.updated,
      lines: [
        stats.patch && `Patch ${stats.patch}${stats.days ? `, ${stats.days} day${stats.days === 1 ? "" : "s"} of games` : ""}`,
        stats.through && `Games through ${day(stats.through)}`,
        "Win rates, pick rates, builds and augments. Refreshed every day.",
      ],
    },
    {
      name: "PBE changes",
      href: "/pbe",
      at: pbe.updated,
      lines: [
        pbe.build && `Test server build ${pbe.build}`,
        pbe.changes && `${pbe.changes} changes tracked as of ${day(pbe.through)}`,
        "Checked for new changes every evening.",
      ],
    },
    {
      name: "Simulator",
      href: "/simulator",
      at: simulator.updated,
      lines: [simulator.patch && `Modelled on patch ${simulator.patch}`, "Champion, item and augment numbers, simulated builds and fight replays."],
    },
    { name: "Website", href: "/", at: built, lines: ["The last time a new version of the site went live."] },
  ];
  return (
    <>
      <Intro eyebrow="Status" title="How fresh is everything?">
        When each part of DeepARAM last got new data. Times are shown in your own time zone.
      </Intro>
      <div className="status-grid">
        {rows.map((r) => (
          <section key={r.name} className="card status-card">
            <div className="card-head">
              <h2>
                <Link href={r.href}>{r.name}</Link>
              </h2>
              <Freshness at={r.at} />
            </div>
            <ul>
              {r.lines.filter(Boolean).map((l) => (
                <li key={String(l)}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="patch-note">
        Something looks out of date? <a className="inline-link" href="mailto:admin@deeparam.com">Let us know</a>.
      </p>
    </>
  );
}
