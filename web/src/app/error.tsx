"use client";

import { useEffect } from "react";
import { clearReloadFlag, isStaleChunk, reloadOnce } from "@/lib/recover";

// Shown instead of a blank "Application error" when a page fails in the browser.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    if (isStaleChunk(error)) reloadOnce();
  }, [error]);
  return (
    <section className="intro">
      <p className="eyebrow">Something went wrong</p>
      <h1>This page didn&apos;t load.</h1>
      <p className="lede">The site may have just updated. Try again, or reload the page.</p>
      <p style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
        <button type="button" className="btn" onClick={() => (clearReloadFlag(), reset())}>
          Try again
        </button>
        <button type="button" className="btn ghost" onClick={() => location.reload()}>
          Reload
        </button>
      </p>
    </section>
  );
}
