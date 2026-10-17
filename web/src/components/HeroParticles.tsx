"use client";

import { useEffect, useRef, useState } from "react";
import { loadSettings, SETTINGS_EVENT } from "@/lib/settings";

// Home's hero background: slow glowing motes in the accent colours that drift upward and ease
// away from the pointer. Off with reduced motion or Low graphics; paused offscreen or in a hidden tab.

type Mote = { x: number; y: number; r: number; vx: number; vy: number; hue: 0 | 1; phase: number };

const allowed = () =>
  loadSettings().graphics !== "low" &&
  document.documentElement.dataset.motion !== "reduce" &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function HeroParticles() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const check = () => setOn(allowed());
    check();
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener(SETTINGS_EVENT, check);
    mq.addEventListener("change", check);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, check);
      mq.removeEventListener("change", check);
    };
  }, []);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!on || !c || !ctx) return;
    let w = 0,
      h = 0,
      dpr = 1,
      raf = 0,
      visible = true;
    let motes: Mote[] = [];
    let colors = ["#5cc0ff", "#b18cff"];
    let blend: GlobalCompositeOperation = "lighter";
    const pointer = { x: -1e4, y: -1e4 };

    const readColors = () => {
      const s = getComputedStyle(c);
      colors = [s.getPropertyValue("--accent").trim() || colors[0], s.getPropertyValue("--hue-sim").trim() || colors[1]];
      // Additive glow on dark backgrounds; plain paint on light ones, where adding light would vanish.
      const bg = /^#?([0-9a-f]{6})$/i.exec(s.getPropertyValue("--bg").trim())?.[1];
      const lum = bg ? [0, 2, 4].reduce((sum, i) => sum + parseInt(bg.slice(i, i + 2), 16), 0) / 765 : 0;
      blend = lum > 0.5 ? "source-over" : "lighter";
    };
    const size = () => {
      const r = c.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      // About one mote per 9,000 px², capped so phones stay light.
      const n = Math.min(90, Math.round((w * h) / 9000));
      motes = Array.from({ length: n }, (_, i) => motes[i] ?? spawn(true));
    };
    const spawn = (anywhere: boolean): Mote => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -(0.1 + Math.random() * 0.35),
      hue: Math.random() < 0.7 ? 0 : 1,
      phase: Math.random() * Math.PI * 2,
    });

    let t = 0;
    const frame = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      t += 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = blend;
      for (const m of motes) {
        const dx = m.x - pointer.x,
          dy = m.y - pointer.y,
          d2 = dx * dx + dy * dy;
        if (d2 < 120 * 120) {
          const f = (1 - Math.sqrt(d2) / 120) * 0.6;
          m.x += (dx / (Math.sqrt(d2) || 1)) * f;
          m.y += (dy / (Math.sqrt(d2) || 1)) * f;
        }
        m.x += m.vx + Math.sin((t + m.phase * 100) / 140) * 0.12;
        m.y += m.vy;
        if (m.y < -10 || m.x < -10 || m.x > w + 10) Object.assign(m, spawn(false));
        const a = 0.5 + 0.35 * Math.sin(t / 50 + m.phase);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
        g.addColorStop(0, colors[m.hue]);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    const go = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    readColors();
    size();
    go();
    const ro = new ResizeObserver(size);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      go();
    });
    io.observe(c);
    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const theme = new MutationObserver(readColors);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("visibilitychange", go);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      theme.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", go);
    };
  }, [on]);

  return on ? <canvas ref={canvas} className="hero-particles" aria-hidden="true" /> : null;
}
