import type { Metadata } from "next";
import Link from "next/link";
import Embed from "@/components/Embed";
import Intro from "@/components/Intro";
import { isAdmin } from "@/lib/admin-session";

// The full Simulator replay (3D models, game sounds), for signed-in admins only. The public Simulator
// at /simulator keeps the 2D replay. The files themselves are guarded too (src/middleware.ts).
export const metadata: Metadata = { title: "Simulator (full) · DeepARAM", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminSimulatorPage() {
  if (!(await isAdmin())) {
    return (
      <Intro eyebrow="Admin" title="Sign in first.">
        The full Simulator is for admins.{" "}
        <Link className="inline-link" href="/admin">
          Sign in on the editor page
        </Link>
        , then come back here.
      </Intro>
    );
  }
  return (
    <>
      <Intro eyebrow="Admin" title="Simulator (full)">
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
