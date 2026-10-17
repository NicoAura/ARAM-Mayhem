"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report";

// Catches uncaught errors and failed promises anywhere on the site and reports them (lib/report.ts).
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      reportError(e.message || "Script error", { source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      reportError(r instanceof Error ? r.message : String(r), { stack: r instanceof Error ? r.stack : undefined });
    };
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      removeEventListener("error", onError);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
