// Speed Cap Breaker math. Pure functions, no DOM.
//
// Raw speed = (base + flat bonuses) * (1 + sum of % bonuses) * product of multipliers.
// Then League's soft caps: above 415 only 80% of the extra counts, above 490 only 50%.
// Every source is an "effect" from data.js: flat, pct or mult, sometimes with a ranged value,
// a value by level, or a toggle / number input (opt) it depends on.
(function (root) {
  "use strict";

  const CAPS = [{ at: 415, keep: 0.8 }, { at: 490, keep: 0.5 }];
  const RANGED_FROM = 300; // attack range at or above this counts as ranged

  // Applies the soft caps to a raw speed. Thresholds are on the raw value, so 490 raw becomes 475.
  function capped(raw) {
    let out = Math.min(raw, CAPS[0].at);
    for (let i = 0; i < CAPS.length; i++) {
      const lo = CAPS[i].at, hi = CAPS[i + 1] ? CAPS[i + 1].at : Infinity;
      if (raw > lo) out += (Math.min(raw, hi) - lo) * CAPS[i].keep;
    }
    return out;
  }

  // How much one effect gives with these options. Returns null when its toggle is off.
  function amount(e, opts, ranged, level) {
    let v = e.byLevel ? e.byLevel[level - 1] : ranged && e.ranged !== undefined ? e.ranged : e.value;
    if (!e.opt) return v;
    const raw = opts[e.opt.key] ?? e.opt.def;
    if (e.opt.type === "check") return raw ? v : null;
    const n = Math.max(0, Math.min(e.opt.max ?? Infinity, +raw || 0));
    return (e.base || 0) + v * n;
  }

  // build: { champion, items: [id...], augments: [key...], opts: {...} }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const opts = build.opts || {};
    const level = Math.max(1, Math.min(18, Math.round(+(opts.level ?? 18)) || 18));
    const ranged = opts.ranged ?? champ.range >= RANGED_FROM;
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);

    const sources = [];
    const add = (label, kind, value, on = true) => { if (value || !on) sources.push({ label, kind, value: value || 0, on }); };
    for (const owner of [...items, ...augs]) {
      add(owner.name, "flat", owner.flat);
      add(owner.name, "pct", owner.pct);
      for (const e of owner.effects) {
        const v = amount(e, opts, ranged, level);
        const label = e.label.startsWith(owner.name) ? e.label : `${owner.name}: ${e.label}`;
        add(label, e.kind, v ?? 0, v !== null);
      }
    }
    add("Other flat Move Speed", "flat", +opts.otherFlat || 0);
    add("Other Move Speed %", "pct", (+opts.otherPct || 0) / 100);
    add("Other multiplier", "mult", (+opts.otherMult || 0) / 100);

    const live = sources.filter((s) => s.on);
    const flat = live.filter((s) => s.kind === "flat").reduce((t, s) => t + s.value, 0);
    const pct = live.filter((s) => s.kind === "pct").reduce((t, s) => t + s.value, 0);
    const mult = live.filter((s) => s.kind === "mult").reduce((t, s) => t * (1 + s.value), 1);
    const raw = (champ.ms + flat) * (1 + pct) * mult;
    const final = capped(raw);
    return { champion: champ, level, ranged, sources, flat, pct, mult, raw, final, eaten: raw - final };
  }

  // Share of champions whose base speed is lower than this speed.
  function fasterThan(data, speed) {
    return data.champions.filter((c) => c.ms < speed).length / data.champions.length;
  }

  const api = { compute, capped, fasterThan, CAPS, RANGED_FROM };
  if (typeof module !== "undefined") module.exports = api;
  else root.SpeedCalc = api;
})(this);
