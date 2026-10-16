// Gold Rush math. Pure functions, no DOM.
//
// Steps through the game one second at a time. You start with Mayhem's starting gold; from the
// passive gold start time you earn passive gold plus your kills, assists and minion last hits as
// steady rates. Items are bought in order: each one finishes the moment your saved gold covers its
// full price. Gold augments add their own income from the minute you take them (Upgrade augments
// from the moment you own the item they upgrade). The same game is run again without the augments
// to see how much time they save.
(function (root) {
  "use strict";

  const STEP = 1, HORIZON = 60 * 60, SAMPLE = 10;
  const MARKS = [600, 1200, 1800];

  // Inputs that are not tied to an augment. Fixed values come from data.income.
  function defaults(data) {
    const inc = data.income;
    return {
      startGold: inc.startingGold, passiveGold: inc.passiveGold, killGold: inc.killGold,
      minionGold: (inc.minionGold.melee + inc.minionGold.ranged) / 2,
      kills: 0.5, assists: 1, assistGold: 35, minions: 3,
      hits: 3, burnTicks: 40, burnDamage: 2000, coins: 3, fsProcs: 2, fsDamage: 800, fsRanged: false,
      immolateTicks: 20, executes: 0.2,
    };
  }

  const mid = (c) => (c ? (c.lvl1 + c.lvl18) / 2 : 0);

  // Steady gold per second an augment pays once it is active, and gold it pays once when it starts.
  function augmentIncome(a, o) {
    const v = a.values;
    switch (a.kind) {
      case "hits": // GoldPerProc x TotalLoops per champion, once per champion every TimerDuration seconds
        return { rate: (v.GoldPerHit * Math.min(5, o.hits)) / v.TimerDuration, once: 0 };
      case "burn": // GoldPerProc grows 1 to 3 with level; the middle is used
        return { rate: (o.burnTicks * mid(a.calcs.GoldPerProc) + o.burnDamage * v.PercentGoldFromDamage) / 60, once: 0 };
      case "coins": { // takedowns drop coins (more with level); you pick some of them up
        const coins = Math.min(o.coins, a.calcs.Calc_Max_Coins_To_Drop ? a.calcs.Calc_Max_Coins_To_Drop.lvl18 : o.coins);
        return { rate: ((o.kills + o.assists) * coins * v.GoldPerCoin) / 60, once: 0 };
      }
      case "firstStrike": { // flat gold per proc plus a share of the bonus damage it deals
        const cd = a.calcs.Cooldown ? a.calcs.Cooldown.lvl18 : 15;
        const procs = Math.min(o.fsProcs, 60 / cd);
        const share = o.fsRanged ? v.GoldPercentBonusRanged : v.GoldPercentBonus;
        return { rate: (procs * (v.GoldProcBonus + share * v.DamageAmp * o.fsDamage)) / 60, once: 0 };
      }
      case "immolate": return { rate: (o.immolateTicks * v.GoldPerTick) / 60, once: a.gold };
      case "execute": return { rate: (o.executes * v.UpgradedGoldAmount) / 60, once: a.gold };
      case "instant": return { rate: 0, once: a.gold };
      default: return { rate: 0, once: 0 };
    }
  }

  function simulate(data, items, augs, o, at) {
    const inc = data.income;
    const baseRate = inc.passiveGold / inc.passiveInterval + (o.kills * o.killGold + o.assists * o.assistGold + o.minions * o.minionGold) / 60;
    const plan = augs.map((a) => ({ a, ...augmentIncome(a, o), start: Math.max(0, at(a.key)) * 60, on: false, earned: 0, note: "" }));
    const finish = items.map(() => null), discount = items.map(() => 0);
    let wallet = o.startGold, earned = o.startGold, next = 0;
    const series = [earned], marks = {};

    const owns = (ids) => items.some((it, i) => finish[i] !== null && ids.includes(it.id));
    const buy = (t) => {
      while (next < items.length && wallet >= items[next].price - discount[next]) {
        wallet -= items[next].price - discount[next];
        finish[next++] = t;
      }
    };
    const earn = (p, g) => { wallet += g; earned += g; if (p) p.earned += g; };

    for (let t = 0; t <= HORIZON; t += STEP) {
      for (const p of plan) {
        if (p.on || t < p.start || (p.a.needs.length && !owns(p.a.needs))) continue;
        p.on = true;
        p.at = t;
        if (p.a.free) {
          // A free component counts toward the first unfinished item that is built from it.
          const i = items.findIndex((it, j) => j >= next && it.parts.includes(p.a.free.id));
          if (i >= 0) { discount[i] += p.a.free.price; p.earned += p.a.free.price; earned += p.a.free.price; }
          else p.note = "unused";
        }
        earn(p, p.once);
      }
      buy(t);
      if (t > 0 && t % SAMPLE === 0) series.push(earned);
      if (MARKS.includes(t)) marks[t] = earned;
      if (t === MARKS[MARKS.length - 1]) for (const p of plan) p.by30 = p.earned;
      if (next >= items.length && t >= MARKS[MARKS.length - 1]) break;
      if (t >= inc.passiveStart) earn(null, baseRate * STEP);
      for (const p of plan) if (p.on && p.rate) earn(p, p.rate * STEP);
    }
    for (const p of plan) if (!p.on && p.a.needs.length) p.note = owns(p.a.needs) ? "" : "needs item";
    const done = items.length && finish.every((f) => f !== null) ? finish[finish.length - 1] : null;
    return { finish, done, series, marks, plan, baseRate };
  }

  // build: { items: [id...], augments: [key...], opts: {...} }
  function compute(data, build) {
    const o = { ...defaults(data), ...(build.opts || {}) };
    const items = build.items.map((id) => data.items.find((i) => i.id === id)).filter(Boolean);
    const augs = build.augments.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const at = (k) => +(o[`at_${k}`] ?? 0) || 0;

    const withAugs = simulate(data, items, augs, o, at);
    const without = simulate(data, items, [], o, at);
    const saved = withAugs.done !== null && without.done !== null ? (without.done - withAugs.done) / 60 : null;
    return {
      opts: o, items, augs,
      finish: withAugs.finish, finishBase: without.finish,
      done: withAugs.done, doneBase: without.done, saved,
      marks: withAugs.marks, marksBase: without.marks,
      series: withAugs.series, seriesBase: without.series, sample: SAMPLE,
      augments: withAugs.plan.map((p) => ({ aug: p.a, earned: p.by30 ?? p.earned, at: p.on ? p.at : null, note: p.note, rate: p.rate * 60, once: p.once })),
      perMinute: withAugs.baseRate * 60, totalCost: items.reduce((s, it) => s + it.price, 0),
    };
  }

  const api = { compute, defaults, augmentIncome, HORIZON };
  if (typeof module !== "undefined") module.exports = api;
  else root.GoldCalc = api;
})(this);
