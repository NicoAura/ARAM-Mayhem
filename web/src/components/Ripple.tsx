"use client";

import { useEffect } from "react";

// Material-style ink ripple for any element with the `ripple` class.
export default function Ripple() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const host = (e.target as HTMLElement).closest<HTMLElement>(".ripple");
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const wave = document.createElement("span");
      wave.className = "ripple-wave";
      wave.style.width = wave.style.height = `${size}px`;
      wave.style.left = `${e.clientX - rect.left - size / 2}px`;
      wave.style.top = `${e.clientY - rect.top - size / 2}px`;
      host.appendChild(wave);
      wave.addEventListener("animationend", () => wave.remove());
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  return null;
}
