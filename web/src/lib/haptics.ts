import { loadSettings } from "./settings";

// Short vibrations for touch actions on phones that support them (Android; iPhones have no web
// vibration). Off with the Vibration setting, and never on a mouse-driven screen.

const PATTERNS = { tap: 8, step: 12, done: [10, 40, 18] } as const;

export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && matchMedia("(pointer: coarse)").matches;

export function buzz(kind: keyof typeof PATTERNS = "tap") {
  if (!canVibrate() || !loadSettings().haptics) return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {}
}
