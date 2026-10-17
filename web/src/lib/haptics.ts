import { loadSettings } from "./settings";
import { chime } from "./ui-sound";

// Short haptic taps for touch actions. On Android they vibrate; iPhones have no web vibration, so the
// DeepARAM app (user agent "DeepARAMApp/") plays them natively: it listens on the "deeparamHaptic"
// message handler, or for the "deeparam-haptic" window event ({detail: {kind}}). Off with the Haptics
// setting, and never on a mouse-driven screen. Each one also plays the matching interface sound when
// those are turned on (lib/ui-sound.ts).

const PATTERNS = { tap: 8, step: 12, done: [10, 40, 18] } as const;
export type HapticKind = keyof typeof PATTERNS;

type AppBridge = { webkit?: { messageHandlers?: { deeparamHaptic?: { postMessage: (m: unknown) => void } } } };

export const inApp = () => typeof navigator !== "undefined" && /DeepARAMApp\//.test(navigator.userAgent);
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && matchMedia("(pointer: coarse)").matches;
/** Whether this device can feel haptics at all (the Haptics setting is only shown then). */
export const hapticsAvailable = () => inApp() || canVibrate();

let last = 0;
export function buzz(kind: HapticKind = "tap") {
  // A control with its own buzz also reaches the page-wide tap handler; one tap is enough.
  const now = performance.now();
  if (now - last < 60) return;
  last = now;
  chime(kind);
  if (!loadSettings().haptics) return;
  dispatchEvent(new CustomEvent("deeparam-haptic", { detail: { kind } }));
  const app = (window as unknown as AppBridge).webkit?.messageHandlers?.deeparamHaptic;
  try {
    if (app) app.postMessage({ kind });
    else if (canVibrate()) navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {}
}
