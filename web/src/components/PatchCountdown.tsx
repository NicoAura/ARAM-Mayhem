"use client";

import { useEffect, useState } from "react";
import { inDays, longDate, nextPatch, type NextPatch, type PatchSchedule } from "@/lib/patch-schedule";

// Countdown to the next patch on Riot's schedule. The server renders it as of the build; the browser
// recomputes it on load and every hour so a cached page stays right.
export default function PatchCountdown({ schedule, note }: { schedule: PatchSchedule; note?: string }) {
  const [next, setNext] = useState<NextPatch | null>(() => nextPatch(schedule));
  useEffect(() => {
    const tick = () => setNext(nextPatch(schedule));
    tick();
    const id = setInterval(tick, 3_600_000);
    return () => clearInterval(id);
  }, [schedule]);
  if (!next) return null;

  return (
    <div className="patch-countdown" role="status">
      <span className="patch-countdown-days">
        {next.days === 0 ? (
          <b>Today</b>
        ) : (
          <>
            <b>{next.days}</b> {next.days === 1 ? "day" : "days"}
          </>
        )}
      </span>
      <span className="patch-countdown-text">
        <b>
          Patch {next.patch} {next.days === 0 ? "is out today" : `comes out ${inDays(next.days)}`}
        </b>
        <span className="sub">
          {longDate(next.date)} (Pacific Time){note ? `. ${note}` : ""}
        </span>
      </span>
    </div>
  );
}
