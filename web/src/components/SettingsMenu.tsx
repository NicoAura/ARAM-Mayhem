"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadSettings, saveSettings, SETTINGS_EVENT, type Settings } from "@/lib/settings";
import ThemeToggle from "./ThemeToggle";
import Link from "next/link";
import { TOUR_EVENT } from "./FirstVisitTour";
import { canVibrate } from "@/lib/haptics";
import { chime } from "@/lib/ui-sound";

// Gear button at the top right: theme plus the site's other per-browser settings.

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setS(loadSettings());
    sync();
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = (patch: Partial<Settings>) => setS(saveSettings(patch));

  return (
    <div className="account" ref={box}>
      <button type="button" className="account-btn" aria-label="Settings" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>
      {open && s && (
        <div className="account-menu settings-menu" role="dialog" aria-label="Settings">
          <p className="account-title">Settings</p>
          <div className="setting">
            <span>Theme</span>
            <ThemeToggle labels />
          </div>
          <Choice label="Motion" value={s.motion} options={[["system", "Match system"], ["reduce", "Reduce"]]} onChange={(motion) => set({ motion })} />
          <Choice label="Sound and voice lines" value={s.sound ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ sound: v === "on" })} />
          {s.sound && (
            <Choice label="Interface sounds" value={s.uiSound ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => {
                set({ uiSound: v === "on" });
                if (v === "on") chime("done");
              }} />
          )}
          {canVibrate() && (
            <Choice label="Vibration" value={s.haptics ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => set({ haptics: v === "on" })} />
          )}
          <Choice label="Simulator graphics" value={s.graphics} options={[["auto", "Auto"], ["low", "Low"], ["high", "High"]]} onChange={(graphics) => set({ graphics })} />
          <Choice label="Tier List starts on" value={s.tierRange} options={[["live", "Live patch"], ["last3", "Last 3"], ["all", "All time"]]} onChange={(tierRange) => set({ tierRange })} />
          <p className="account-note">
            Saved in this browser.{" "}
            <Link
              className="inline-link"
              href="/"
              onClick={() => {
                setOpen(false);
                dispatchEvent(new Event(TOUR_EVENT));
              }}
            >
              Take the tour
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
