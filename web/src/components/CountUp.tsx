"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Headline numbers (.stat-row values and anything marked data-count-up) count up from zero the first
// time they scroll into view. Only the existing text node's value changes, and it ends on the exact
// original text, so React's markup is untouched. Off with reduced motion.

const SELECTOR = ".stat-row b, [data-count-up]";
const DURATION = 900;
// "57.4%", "1,234", "#3 of 173", "+0.8"
const NUMBER = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/;

const reduced = () => document.documentElement.dataset.motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;

function animate(el: Element) {
  const node = el.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) return;
  const text = node.nodeValue ?? "";
  const m = NUMBER.exec(text.trim());
  if (!m) return;
  const target = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(target) || target === 0) return;
  const decimals = m[2].split(".")[1]?.length ?? 0;
  const commas = m[2].includes(",");
  const fmt = (v: number) => {
    const s = commas ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
    return `${m[1]}${s}${m[3]}`;
  };
  const start = performance.now();
  const step = (now: number) => {
    if (node.nodeValue === null || !el.isConnected) return;
    const t = Math.min(1, (now - start) / DURATION);
    const eased = 1 - Math.pow(1 - t, 3);
    node.nodeValue = t >= 1 ? text : fmt(target * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  node.nodeValue = fmt(0);
  requestAnimationFrame(step);
}

export default function CountUp() {
  const pathname = usePathname();
  useEffect(() => {
    if (reduced()) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || seen.has(e.target)) continue;
          seen.add(e.target);
          io.unobserve(e.target);
          animate(e.target);
        }
      },
      { threshold: 0.6 },
    );
    const watch = () => document.querySelectorAll(SELECTOR).forEach((el) => !seen.has(el) && io.observe(el));
    // After this page's content has rendered.
    const t = setTimeout(watch, 50);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [pathname]);
  return null;
}
