// One-shot math. Pure functions, no DOM.
//
// Resists: % reduction (Black Cleaver, Erosion), then % penetration, then flat penetration and
// Lethality (full flat Armor penetration now). Reduction and penetration only cut positive resists and
// stack multiplicatively. Damage taken = damage × 100 / (100 + resist), or × (2 - 100 / (100 - resist))
// when resist is negative. Damage bonuses multiply together, and true damage riders (Glass Cannon,
// Devil on Your Shoulder) are a share of the damage that lands.
(function (root) {
  "use strict";

  const TYPES = ["physical", "magic", "true"];
  // Target builds. Plain numbers we picked for a typical late ARAM game; the page lets you edit them.
  const TARGETS = {
    none: { label: "No items", hp: 0, ar: 0, mr: 0 },
    squishy: { label: "Squishy", hp: 800, ar: 0, mr: 0 },
    bruiser: { label: "Bruiser", hp: 1600, ar: 70, mr: 50 },
    tank: { label: "Tank", hp: 2800, ar: 160, mr: 120 },
  };
  const GIANT = { small: "SmallBonusDamage", medium: "MedBonusDamage", large: "LargeBonusDamage", xlarge: "XLargeBonusDamage" };
  const DEFAULTS = {
    cleaverStacks: 5, abyssal: true, riftmaker: false, liandry: false, shojinStacks: 4, erosionStacks: 20,
    teeth: 5, ranged: false, giant: "xlarge", brush: true, firstStrike: true, abilities: true, mana: 2000,
    msDiff: 100, dropkick: 4,
  };

  function statAt(base, growth, level) {
    const n = level - 1;
    return base + growth * n * (0.7025 + 0.0175 * n);
  }

  function effectiveResist(total, reductions, pens, flat) {
    let r = total;
    if (r > 0) {
      for (const x of reductions) r *= 1 - x;
      for (const x of pens) r *= 1 - x;
      r = Math.max(0, r - flat);
    }
    return r;
  }

  const resistMultiplier = (r) => (r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r));

  // build: { champion, level, bonus: {hp, ar, mr}, raw: {physical, magic, true}, items: [id...], augments: [key...], opts }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const opts = build.opts || {};
    const opt = (k) => opts[k] ?? DEFAULTS[k];
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const bonus = build.bonus || {}, raw = { ...build.raw };
    for (const t of TYPES) raw[t] = Math.max(0, +raw[t] || 0);

    const base = {
      hp: statAt(champ.hp, champ.hpG, build.level), ar: statAt(champ.ar, champ.arG, build.level),
      mr: statAt(champ.mr, champ.mrG, build.level),
    };
    const maxHP = Math.max(1, base.hp + (+bonus.hp || 0));
    const armor = base.ar + (+bonus.ar || 0), mr = base.mr + (+bonus.mr || 0);

    const sources = [];
    const pen = { lethality: 0, magicFlat: 0, armorPct: [], magicPct: [], armorRed: [], mrRed: [] };
    const amps = []; // { label, value, scope: all | magic | ability }
    const riders = []; // true damage as a share of the damage that lands
    const add = (label, kind, value) => { if (value) sources.push({ label, kind, value }); };
    const addAmp = (label, value, scope = "all") => {
      if (!value || (scope === "ability" && !opt("abilities"))) return;
      amps.push({ label, value, scope });
      add(label, scope === "magic" ? "magicAmp" : "amp", value);
    };
    let execute = 0, executeBy = null;
    const addExecute = (label, v) => { add(label, "execute", v); if (v > execute) { execute = v; executeBy = label; } };

    for (const it of items) {
      const v = it.values;
      if (it.lethality) { pen.lethality += it.lethality; add(it.name, "lethality", it.lethality); }
      if (it.armorPen) { pen.armorPct.push(it.armorPen); add(it.name, "armorPen", it.armorPen); }
      if (it.magicPenFlat) { pen.magicFlat += it.magicPenFlat; add(it.name, "magicPenFlat", it.magicPenFlat); }
      if (it.magicPen) { pen.magicPct.push(it.magicPen); add(it.name, "magicPen", it.magicPen); }
      if (v.ShredPerStack) {
        const n = Math.max(0, Math.min(v.MaxStacks, opt("cleaverStacks")));
        if (n) { pen.armorRed.push(n * v.ShredPerStack); add(`${it.name} (${n} stacks)`, "armorRed", n * v.ShredPerStack); }
      }
      if (v.DamageAmp && opt("abyssal")) addAmp(`${it.name} (target nearby)`, v.DamageAmp, "magic");
      if (v.EternityDamageIncreaseMax && opt("riftmaker")) addAmp(`${it.name} (full strength)`, v.EternityDamageIncreaseMax);
      if (v.DamageIncreaseMax && opt("liandry")) addAmp(`${it.name} (full strength)`, v.DamageIncreaseMax);
      if (v.SpellDamageIncrease) {
        const n = Math.max(0, Math.min(v.StackCount, opt("shojinStacks")));
        addAmp(`${it.name} (${n} stacks)`, n * v.SpellDamageIncrease, "ability");
      }
      if (v.MaxBonusDamagePercent) {
        const share = Math.max(0, Math.min(1, (+bonus.hp || 0) / v.MaxBonusHealth));
        addAmp(`${it.name} (vs ${Math.round(+bonus.hp || 0)} bonus Health)`, share * v.MaxBonusDamagePercent);
      }
      if (v.ExecuteThreshold) addExecute(it.name, v.ExecuteThreshold);
    }

    for (const a of augs) {
      const v = a.values;
      switch (a.key) {
        case "ARAM_ThreadtheNeedle":
          pen.armorPct.push(v.PercentPen); pen.magicPct.push(v.PercentPen);
          add(a.name, "bothPen", v.PercentPen);
          break;
        case "ARAM_Erosion": {
          const n = Math.max(0, Math.min(v.MaxStacks, opt("erosionStacks")));
          if (n) { pen.armorRed.push(n * v.Shred); pen.mrRed.push(n * v.Shred); add(`${a.name} (${n} stacks)`, "bothRed", n * v.Shred); }
          break;
        }
        case "BurstingTeeth": {
          const n = Math.max(0, Math.min(1000, opt("teeth")));
          pen.lethality += n * v.LethalityPerTooth; pen.magicFlat += n * v.MPenPerTooth;
          add(`${a.name} (${n} teeth)`, "lethality", n * v.LethalityPerTooth);
          add(`${a.name} (${n} teeth)`, "magicPenFlat", n * v.MPenPerTooth);
          break;
        }
        case "GlassCannon": {
          const pct = v.TrueDamagePerc * (opt("ranged") ? v.RangedMultiplier : 1);
          riders.push({ label: a.name, value: pct }); add(a.name, "rider", pct);
          break;
        }
        case "ARAM_LittleDevil": riders.push({ label: a.name, value: v.BaseDamageAmp }); add(a.name, "rider", v.BaseDamageAmp); break;
        case "ARAM_GiantSlayer": addAmp(a.name, v[GIANT[opt("giant")]] || 0); break;
        case "BrushPower": if (opt("brush")) addAmp(`${a.name} (from Brush)`, v.DamageAmplification); break;
        case "ARAM_FromBeginningToEnd": if (opt("firstStrike")) addAmp(`${a.name} (First Strike)`, v.DamageAmp); break;
        case "ARAM_BacktoBasics": addAmp(a.name, v.DamageAmp, "ability"); break;
        case "ARAM_Overflow": {
          const c = a.calcs.ManaCalc, mana = Math.max(0, opt("mana"));
          addAmp(`${a.name} (${Math.round(mana)} Mana)`, (c.flat + c.manaRatio * mana) * c.multiplier, "ability");
          break;
        }
        case "ARAM_DontBlink": {
          const d = Math.max(0, opt("msDiff"));
          addAmp(`${a.name} (+${Math.round(d)} Move Speed)`, d * v.BonusDamagePerMSDifference);
          break;
        }
        case "ARAM_Dropkick": addExecute(a.name, Math.max(0, Math.min(100, opt("dropkick"))) / 100); break;
      }
    }

    // Bastionbreaker's Shaped Charge: one hit of true damage from the burst's abilities.
    const bb = items.find((it) => it.values.ChargeBase);
    let charge = 0;
    if (bb && opt("abilities")) {
      charge = (bb.values.ChargeBase + bb.values.ChargeLethalityRatio * pen.lethality) * (opt("ranged") ? bb.values.AbilityDamageRangeMod : 1);
      add(`${bb.name} (Shaped Charge)`, "flatTrue", charge);
    }

    const effArmor = effectiveResist(armor, pen.armorRed, pen.armorPct, pen.lethality);
    const effMR = effectiveResist(mr, pen.mrRed, pen.magicPct, pen.magicFlat);
    const amp = (scope) => amps.filter((a) => a.scope === scope).reduce((m, a) => m * (1 + a.value), 1);
    const ampAll = amp("all") * amp("ability");
    const riderShare = riders.reduce((s, r) => s + r.value, 0);
    const factor = {
      physical: resistMultiplier(effArmor) * ampAll,
      magic: resistMultiplier(effMR) * ampAll * amp("magic"),
      true: ampAll,
    };

    const dealt = {};
    for (const t of TYPES) dealt[t] = raw[t] * factor[t];
    dealt.true += charge * factor.true;
    const landed = dealt.physical + dealt.magic + dealt.true;
    const riderDamage = riders.map((r) => ({ label: r.label, value: landed * r.value }));
    const total = landed * (1 + riderShare);

    const killAt = maxHP * (1 - execute);
    const kill = total >= killAt;
    const missing = Math.max(0, killAt - total);
    const need = {};
    for (const t of TYPES) need[t] = missing / (factor[t] * (1 + riderShare));

    return {
      champion: champ, level: build.level, base, maxHP, armor, mr, effArmor, effMR,
      lethality: pen.lethality, magicFlat: pen.magicFlat, factor, raw, charge, dealt, riderDamage, riderShare,
      landed, total, share: total / maxHP, execute, executeBy, killAt, kill, left: Math.max(0, maxHP - total), missing,
      need, sources,
    };
  }

  const api = { compute, statAt, effectiveResist, resistMultiplier, TARGETS, DEFAULTS, TYPES };
  if (typeof module !== "undefined") module.exports = api;
  else root.OneShotCalc = api;
})(this);
