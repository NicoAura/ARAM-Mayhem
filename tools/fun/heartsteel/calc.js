// Heartsteel growth math. Pure functions, no DOM.
//
// Each Heartsteel proc deals BaseDamage + HPRatio * max Health, and permanently adds
// DamageToMaxHealthRatio of that damage as max Health (a "stack" is 1 Health). Max Health
// feeds the next proc, so stacks grow geometrically. Steel Your Heart multiplies the stacks
// once they pass its threshold.
(function (root) {
  "use strict";

  const HEARTSTEEL = 3084;

  function statAt(base, growth, level) {
    const n = level - 1;
    return base + growth * n * (0.7025 + 0.0175 * n);
  }

  // build: { champion, level, items: [id...], augments: [key...], opts: {...} }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const opts = build.opts || {};
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const hs = items.find((i) => i.id === HEARTSTEEL);

    const baseHP = statAt(champ.baseHP, champ.hpPerLevel, build.level);
    const sources = [];
    let flat = 0, amp = 0;
    const addFlat = (label, v) => { if (v) { flat += v; sources.push({ label, kind: "flat", value: v }); } };
    const addAmp = (label, v) => { if (v) { amp += v; sources.push({ label, kind: "amp", value: v }); } };

    for (const it of items) {
      addFlat(it.name, it.hp);
      if (it.values.HPAmp) addAmp(`${it.name} passive`, it.values.HPAmp); // Warmog's
    }

    let quest = null;
    for (const a of augs) {
      const v = a.values;
      switch (a.key) {
        case "ARAM_Quest_SteelYourHeart": quest = v; break;
        case "ARAM_Goliath": addAmp(a.name, v.HealthAmp); break;
        case "ARAM_MadScientist": if (opts.madLarge !== false) addAmp(`${a.name} (large)`, v.HealthAmp); break;
        case "ARAM_DrawYourSword": addAmp(a.name, v.BonusHP); break;
        case "ARAM_TankEngine": {
          const n = Math.max(0, opts.tankStacks ?? 10);
          addAmp(`${a.name} (${n} stacks)`, n * v.MaxHPIncrement);
          break;
        }
        case "ARAM_CelestialBody": addFlat(a.name, v.Health); break;
        case "SoulEater": {
          const n = Math.max(0, opts.soulStacks ?? 15);
          addFlat(`${a.name} (${n} stacks)`, n * v.HealthGainPerStack);
          break;
        }
      }
    }
    addFlat("Other Health (champion stacks, anvils)", +opts.otherHP || 0);

    const mult = 1 + amp;
    const maxHP = (stacks) => (baseHP + flat + stacks) * mult;
    const procDamage = (stacks) => hs ? hs.values.BaseDamage + hs.values.HPRatio * maxHP(stacks) : 0;

    const procs = Math.max(0, Math.min(2000, Math.round(opts.procs ?? 60)));
    const series = [maxHP(0)];
    const milestones = { 10000: null, 20000: null, 50000: null };
    for (const m in milestones) if (maxHP(0) >= +m) milestones[m] = 0;
    let stacks = 0, questProc = null;
    if (hs) {
      for (let i = 1; i <= procs; i++) {
        stacks += hs.values.DamageToMaxHealthRatio * procDamage(stacks);
        if (quest && questProc === null && stacks >= quest.StackThreshold) {
          stacks *= quest.StackMultiplication;
          questProc = i;
        }
        const hp = maxHP(stacks);
        series.push(hp);
        for (const m in milestones) if (milestones[m] === null && hp >= +m) milestones[m] = i;
      }
    }
    // Growth per proc once stacks dominate: each proc adds ratio * HPRatio * mult of max Health.
    const growthPerProc = hs ? hs.values.DamageToMaxHealthRatio * hs.values.HPRatio * mult : 0;

    return {
      champion: champ, baseHP, flat, amp, mult, stacks, procs, series, milestones, questProc,
      hasHeartsteel: !!hs, startHP: maxHP(0), finalHP: maxHP(stacks), finalProc: procDamage(stacks),
      growthPerProc, sources, questThreshold: quest ? quest.StackThreshold : null,
    };
  }

  const api = { compute, statAt, HEARTSTEEL };
  if (typeof module !== "undefined") module.exports = api;
  else root.HeartsteelCalc = api;
})(this);
