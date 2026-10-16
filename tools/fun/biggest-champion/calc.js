// Champion size math. Pure functions, no DOM.
//
// Every size bonus is a percent of normal size. The game files give them as separate percents
// (Goliath SizeAmp 0.5, Tank Engine 0.05 per stack, Heartsteel 3% per 1000 Health up to a 30% cap),
// and the cap on Heartsteel only makes sense for a summed stat, so we add them together:
// size = 1 + sum of bonuses. Shrink Engine stops at 20% of normal size (its MinSize value).
// The visible radius is the champion's selection radius times that size.
(function (root) {
  "use strict";

  const MIN_SIZE = 0.2;

  // build: { champion, items: [id...], augments: [key...], opts: {...} }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const opts = build.opts || {};
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const sources = [];
    let bonus = 0, temporary = 0;
    const add = (label, v, temp = false, note = "") => {
      if (!v) return;
      bonus += v;
      if (temp) temporary += v;
      sources.push({ label, value: v, temp, note });
    };
    const num = (k, def) => Math.max(0, +(opts[k] ?? def) || 0);

    for (const g of data.growth.filter((x) => x.champion === champ.alias)) {
      const rank = Math.min(g.ranks.length, Math.max(0, Math.round(opts[`rank_${g.key}`] ?? 0)));
      if (rank) add(`${champ.name} ${g.label}${g.ranks.length > 1 ? ` rank ${rank}` : ""}`, g.ranks[rank - 1], true, "while active");
    }
    if (champ.alias === "Chogath") {
      const n = num("feastStacks", 20);
      add(`Cho'Gath R · Feast (${n} stacks)`, n * num("feastSize", 0) / 100, false, "your value per stack");
    }

    for (const it of items) {
      const v = it.values;
      if (v.SizeAmount) {
        const hp = num("maxHP", 5000);
        add(`${it.name} (${Math.round(hp).toLocaleString("en-US")} Health)`, Math.min(v.SizeCap, (hp / v.HealthSizeThreshold) * v.SizeAmount));
      } else if (v.SizeIncrease && opts.lifeline !== false) add(`${it.name} (Lifeline)`, v.SizeIncrease, true, "after Lifeline triggers");
    }

    for (const a of augs) {
      const v = a.values;
      switch (a.key) {
        case "ARAM_Goliath": add(a.name, v.SizeAmp); break;
        case "ARAM_MadScientist": if (opts.madLarge !== false) add(`${a.name} (large)`, v.SizeAmp); break;
        case "ARAM_TankEngine": { const n = num("tankStacks", 10); add(`${a.name} (${n} stacks)`, n * v.SizeIncrement); break; }
        case "ARAM_ImTheJuggernaut": {
          const n = Math.min(v.MaxLevel, num("juggLevel", v.MaxLevel));
          add(`${a.name} (level ${n})`, n * v.SizePerLevel, true, "in a fight");
          break;
        }
        case "GrowthSpurt": if (opts.spurt !== false) add(a.name, v.ScaleIncrease, true, `${v.BuffDuration} s`); break;
        case "DimensionShift_Active": if (opts.realm !== false) add(`${a.name} (other Realm)`, v.SelfScaleIncrease, true, `${v.DimensionDuration} s`); break;
        case "ShrinkEngine": { const n = num("shrinkStacks", 5); add(`${a.name} (${n} stacks)`, -n * v.SizeReductionPerStack); break; }
        case "ARAM_GiantSlayer": add(a.name, -v.SizeMod); break;
      }
    }
    add("Other size (your own value)", num("otherSize", 0) / 100);

    const size = Math.max(MIN_SIZE, 1 + bonus);
    const radius = champ.radius * size;
    return {
      champion: champ, baron: data.baron, bonus, temporary, size, radius,
      collision: champ.collision * size, ofBaron: radius / data.baron.radius,
      lasting: Math.max(MIN_SIZE, 1 + bonus - temporary), sources, floored: 1 + bonus < MIN_SIZE,
    };
  }

  const api = { compute, MIN_SIZE };
  if (typeof module !== "undefined") module.exports = api;
  else root.SizeCalc = api;
})(this);
