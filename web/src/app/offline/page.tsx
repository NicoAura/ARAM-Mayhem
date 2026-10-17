import type { Metadata } from "next";
import Intro from "@/components/Intro";
import OfflinePages from "@/components/OfflinePages";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <>
      <Intro eyebrow="Offline" title="You're offline.">
        This page isn&apos;t saved on this device. These pages you opened recently still work without a connection.
      </Intro>
      <section className="card" data-accent="tier">
        <div className="card-head">
          <h2>Saved on this device</h2>
        </div>
        <OfflinePages />
      </section>
    </>
  );
}
