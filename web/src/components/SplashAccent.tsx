"use client";

import { useEffect } from "react";

// Tints a champion page in its splash art's main colour: samples the (same-origin) splash, finds the
// most vivid hue, and hands its hue and saturation to CSS (html[data-champ-accent]), which picks a
// lightness that reads on the current theme. Grey or dark splashes keep the site's own accent.

function dominantHue(img: HTMLImageElement): [number, number] | null {
  const w = 64;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  // 24 hue buckets, each pixel weighted by how vivid it is.
  const bins = Array.from({ length: 24 }, () => ({ w: 0, s: 0, x: 0, y: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.08 || l < 0.18 || l > 0.85) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    if (s < 0.3) continue;
    let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    const wt = s * s * d;
    const bin = bins[Math.floor(hue / 15) % 24];
    bin.w += wt;
    bin.s += s * wt;
    bin.x += Math.cos((hue * Math.PI) / 180) * wt;
    bin.y += Math.sin((hue * Math.PI) / 180) * wt;
  }
  // Score each bucket with its neighbours, so a hue spread over two buckets isn't split.
  let best = -1, score = 0;
  bins.forEach((_, i) => {
    const v = bins[(i + 23) % 24].w * 0.5 + bins[i].w + bins[(i + 1) % 24].w * 0.5;
    if (v > score) [best, score] = [i, v];
  });
  const total = bins.reduce((a, b) => a + b.w, 0);
  if (best < 0 || score / (total || 1) < 0.12 || total < 2) return null;
  const bin = bins[best];
  const hue = ((Math.atan2(bin.y, bin.x) * 180) / Math.PI + 360) % 360;
  return [Math.round(hue), Math.round(Math.min(0.9, Math.max(0.55, bin.s / bin.w)) * 100)];
}

export default function SplashAccent({ src }: { src?: string }) {
  useEffect(() => {
    if (!src) return;
    const root = document.documentElement;
    let live = true;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!live) return;
      const hs = dominantHue(img);
      if (!hs) return;
      root.style.setProperty("--champ-h", String(hs[0]));
      root.style.setProperty("--champ-s", `${hs[1]}%`);
      root.dataset.champAccent = "";
    };
    img.src = src;
    return () => {
      live = false;
      delete root.dataset.champAccent;
      root.style.removeProperty("--champ-h");
      root.style.removeProperty("--champ-s");
    };
  }, [src]);
  return null;
}
