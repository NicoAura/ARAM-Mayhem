"use client";

import { toggleCompare, useCompare } from "@/lib/compare-tray";
import { buzz } from "@/lib/haptics";

/** Adds a champion to (or takes it out of) the compare tray at the bottom of the screen. */
export default function CompareToggle({ id, name, label = false }: { id: string; name: string; label?: boolean }) {
  const on = useCompare().includes(id);
  return (
    <button
      type="button"
      className="cmp-toggle"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from compare` : `Add ${name} to compare`}
      title={on ? "Remove from compare" : "Add to compare"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        buzz();
        toggleCompare(id);
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 8h13l-3.5-3.5M19 16H6l3.5 3.5" />
      </svg>
      {label && <span>{on ? "In compare" : "Add to compare"}</span>}
    </button>
  );
}
