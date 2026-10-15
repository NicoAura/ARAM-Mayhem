import type { Metadata } from "next";
import Placeholder from "@/components/Placeholder";

export const metadata: Metadata = { title: "PBE · ARAM Mayhem" };

export default function PbePage() {
  return (
    <>
      <h1>PBE changes</h1>
      <p className="muted">Mayhem changes currently on the test server.</p>
      <Placeholder>PBE changes will appear here.</Placeholder>
    </>
  );
}
