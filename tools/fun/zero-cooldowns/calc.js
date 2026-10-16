// Zero Cooldowns math. Pure functions, no DOM.
//
// Cooldown = base * 100 / (100 + Ability Haste). Haste adds up from items, augments and
// conversions (AP, crit, attack speed). Some sources only touch some abilities: Ultimate Haste,
// basic-ability haste (Spear of Shojin, Ultimate Awakening's buff), the Bread augments (one key)
// and Dashing (abilities you mark as dashes). Purist - Caster also gives a flat 10% CDR on top.
(function (root) {
  "use strict";

  const MAX_RANK = { Q: 5, W: 5, E: 5, R: 3 };
  const BREAD = { ARAM_BreadAndButter: ["Q", "QAbilityHaste"], ARAM_BreadAndJam: ["W", "WAbilityHaste"], ARAM_BreadAndCheese: ["E", "EAbilityHaste"] };

  // build: { champion, items: [id...], augments: [key...], opts: {...} }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const opts = build.opts || {};
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const has = (k) => augs.some((a) => a.key === k);
    const num = (k, def) => Math.max(0, opts[k] ?? def);

    const sources = [];
    let haste = 0, ultHaste = 0, basicHaste = 0, cdr = 0;
    const per = { Q: 0, W: 0, E: 0, R: 0 };
    const add = (label, v, scope = "all") => {
      if (!v) return;
      sources.push({ label, value: v, scope });
      if (scope === "all") haste += v;
      else if (scope === "R") ultHaste += v;
      else if (scope === "basic") basicHaste += v;
      else per[scope] += v;
    };

    for (const it of items) {
      add(it.name, it.haste);
      add(`${it.name} passive`, it.values.UltimateHaste, "R");
      add(`${it.name} passive`, it.values.AHBase, "basic");
    }
    for (const a of augs) {
      const v = a.values;
      switch (a.key) {
        case "ARAM_Recursion": add(a.name, v.AbilityHaste); break;
        case "InfiniteRecursion": add(`${a.name} (${num("takedowns", 10)} takedowns)`, v.StartingHaste + v.HastePerStack * num("takedowns", 10)); break;
        case "ARAM_MadScientist": if (opts.madTiny !== false) add(`${a.name} (tiny)`, v.Haste); break;
        case "ARAM_BacktoBasics": add(a.name, v.Haste); break;
        case "ARAM_Eureka": add(`${a.name} (${num("ap", 500)} AP)`, v.APToHasteConversion * num("ap", 500)); break;
        case "CritNCast": add(`${a.name} (${num("crit", 100)}% crit)`, v.CritToHasteConversion * num("crit", 100)); break;
        case "ARAM_Purist_Caster":
          add(`${a.name} (${num("as", 50)}% attack speed)`, v.Haste_Per_AS * num("as", 50));
          cdr = 0.1;
          break;
        case "ShrinkEngine": add(`${a.name} (${num("shrink", 5)} stacks)`, v.HastePerStack * num("shrink", 5)); break;
        case "ARAM_BreadAndButter": case "ARAM_BreadAndJam": case "ARAM_BreadAndCheese": {
          const [key, name] = BREAD[a.key];
          add(`${a.name} (${key} only)`, v[name], key);
          break;
        }
        case "ARAM_Dashing":
          for (const k of ["Q", "W", "E", "R"]) if ((opts.dash || []).includes(k)) add(`${a.name} (${k} is a dash)`, v.Haste, k);
          break;
        case "SkipTheBasics": add(a.name, v.Haste); break;
        case "UltimateAwakening":
          add(a.name, v.AH, "R");
          if (opts.awakened) add(`${a.name} buff after Ultimate`, v.AdditionalHaste, "basic");
          break;
        case "ARAM_StuckInHereWithMe": add(a.name, v.UltimateHaste, "R"); break;
        case "SurgeField": if (opts.inZone) add(`${a.name} (inside the zone)`, v.ZoneAbilityHaste); break;
      }
    }
    add("Other Ability Haste", +opts.otherHaste || 0);

    const ultBot = has("SkipTheBasics");
    const sealed = has("ARAM_BacktoBasics");
    const abilities = champ.spells.map((s) => {
      const rank = MAX_RANK[s.key] || 5;
      const base = s.cd[rank - 1] || 0;
      let h;
      if (s.key === "R") h = (haste + ultHaste + per.R) * (ultBot ? 1.5 : 1);
      else h = ultBot ? per[s.key] : haste + basicHaste + per[s.key];
      const off = s.key === "R" && sealed;
      const cd = off ? null : base * (100 / (100 + h)) * (1 - cdr);
      return { ...s, rank, base, haste: h, cd, perMinute: cd ? 60 / cd : null, sealed: off };
    });
    return {
      champion: champ, haste, ultHaste, basicHaste, cdr, sources, abilities, ultBot, sealed,
      castsPerMinute: abilities.reduce((s, a) => s + (a.perMinute || 0), 0),
      reduction: 1 - (100 / (100 + haste)) * (1 - cdr),
    };
  }

  const api = { compute, MAX_RANK };
  if (typeof module !== "undefined") module.exports = api;
  else root.CooldownCalc = api;
})(this);
