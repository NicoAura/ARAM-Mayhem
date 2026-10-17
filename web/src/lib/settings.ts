// Site settings from the header's gear menu, saved in this browser's localStorage.
// Same-origin embeds (the Simulator) read the same key; every change fires SETTINGS_EVENT
// on the page and is written before it fires, so a listener can just call loadSettings().
// The theme is kept separately (lib/theme.ts) because it must apply before paint.

export const SETTINGS_KEY = "deeparam-settings";
export const SETTINGS_EVENT = "deeparam-settings";

export type Settings = {
  /** "system" follows the OS setting; "reduce" turns animations and transitions off. */
  motion: "system" | "reduce";
  /** Champion pick quotes and Simulator sounds. */
  sound: boolean;
  /** Simulator rendering quality; "auto" lets it adapt to the device. */
  graphics: "auto" | "low" | "high";
  /** Soft clicks and chimes on taps and finished actions (needs sound on). */
  uiSound: boolean;
  /** Short vibrations on phone taps and swipes, where the phone supports them. */
  haptics: boolean;
  /** The Tier List's starting patch range. */
  tierRange: "live" | "last3" | "all";
};

export const DEFAULT_SETTINGS: Settings = { motion: "system", sound: true, uiSound: false, haptics: true, graphics: "auto", tierRange: "live" };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(patch: Partial<Settings>) {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  applySettings(next);
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

export function applySettings(s: Settings) {
  const root = document.documentElement;
  if (s.motion === "reduce") root.dataset.motion = "reduce";
  else delete root.dataset.motion;
}

/** Inline before-paint script: applies reduced motion from saved settings. */
export const SETTINGS_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}");if(s.motion==="reduce")document.documentElement.dataset.motion="reduce"}catch(e){}`;
