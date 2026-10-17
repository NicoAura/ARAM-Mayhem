"use client";

import { useEffect } from "react";
import { buzz, hapticsAvailable } from "@/lib/haptics";

// Page-wide haptics: a light tap on buttons, toggles, tabs and menu links, a firmer step on tab
// switches and choices. It listens after the page's own handlers, so a control's own buzz (a "done",
// say) plays first and this one is skipped as a repeat; data-haptic="off" opts an element out.

const TAP = 'button, [role="button"], [role="switch"], [role="menuitem"], summary, .chip-toggle, .nav a, .nav-menu a, .tabbar a, .sheet a, .recent-item';
const STEP = '[role="tab"], [aria-pressed], input[type="checkbox"], input[type="radio"]';

export default function HapticTaps() {
  useEffect(() => {
    if (!hapticsAvailable()) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(`${STEP}, ${TAP}`);
      if (!el || el.closest('[data-haptic="off"]') || (el as HTMLButtonElement).disabled) return;
      buzz(el.matches(STEP) ? "step" : "tap");
    };
    const onChange = (e: Event) => {
      if ((e.target as Element | null)?.matches?.("select")) buzz("step");
    };
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("change", onChange);
    };
  }, []);
  return null;
}
