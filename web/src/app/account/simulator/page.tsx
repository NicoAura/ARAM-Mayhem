import type { Metadata } from "next";
import Link from "next/link";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { isAdmin } from "@/lib/admin-session";

// The full Simulator replay (3D models, game sounds), for the signed-in site owner only (lib/accounts.ts). The public Simulator
// at /simulator keeps the 2D replay. The files themselves are guarded too (src/middleware.ts).
export const metadata: Metadata = { title: "3D Simulator · DeepARAM", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OwnerSimulatorPage() {
  if (!(await isAdmin())) {
    return (
      <Intro eyebrow="Owner" title="Sign in first.">
        The 3D Simulator opens only for the site owner&apos;s account.{" "}
        <Link className="inline-link" href="/account">
          Sign in
        </Link>
        , then come back here.
      </Intro>
    );
  }
  return (
    <>
      <Intro eyebrow="Owner" title="3D Simulator">
        The full replay with 3D models and sounds. Visitors see the 2D version on the{" "}
        <Link className="inline-link" href="/simulator">
          Simulator
        </Link>{" "}
        page.
      </Intro>
      <Embed src="/embed/simulator/full.html" title="Mayhem fight replay (full)" minHeight={900} />
    </>
  );
}
