"use client";

import { useEffect } from "react";
import { isStaleChunk, reloadOnce } from "@/lib/recover";

// Last resort when the site shell itself fails: reload once for a stale version, else offer a reload.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    if (isStaleChunk(error)) reloadOnce();
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#090b0f", color: "#e8edf3", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem" }}>DeepARAM didn&apos;t load.</h1>
          <p style={{ opacity: 0.7 }}>The site may have just updated.</p>
          <button type="button" onClick={() => location.reload()} style={{ marginTop: "1rem", padding: "0.6rem 1.2rem", borderRadius: 999, border: 0, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
