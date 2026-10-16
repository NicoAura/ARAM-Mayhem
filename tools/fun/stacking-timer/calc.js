// Stacking timer math. Pure functions, no DOM.
//
// Each champion gains a fixed number of permanent stacks per event (an ability hit, a minion
// kill, a soul). Given how often each event happens per minute, stacks grow in a straight line,
// so stacks(t) = t * sum(rate * stacksPerEvent). Phenomenal Evil adds 1 AP per champion hit
// with an ability (any champion), plus a head start if taken as the second augment.
(function (root) {
  "use strict";

  const CHECKPOINTS = [5, 10, 15, 20, 25, 30];

  // build: { champion, minutes, rates: {eventKey: perMinute}, extra, target, evil: {on, second, rate} }
  function compute(data, build) {
    const champ = data.champions.find((c) => c.alias === build.champion) || data.champions[0];
    const rates = build.rates || {};
    const rateOf = (e) => Math.max(0, rates[e.key] ?? e.rate);
    const perMinute = champ.events.reduce((s, e) => s + rateOf(e) * e.stacks, 0);
    const minutes = Math.max(0, +build.minutes || 0);
    const extra = Math.max(0, +build.extra || 0);

    const aug = data.augments.find((a) => a.key === "ARAM_PhenomenalEvil");
    const evil = build.evil || {};
    const evilStart = evil.on && evil.second ? aug.values.StartingAPIfSecondAugment : 0;
    const evilPerMinute = evil.on ? Math.max(0, evil.rate ?? 6) * aug.values.APPerProc : 0;
    const evilAP = (t) => (evil.on ? evilStart + evilPerMinute * t : 0);

    const stacksAt = (t) => perMinute * t;
    // The stat the stacks give, plus Phenomenal Evil when the stacks are AP too (Veigar).
    const statAt = (t) => stacksAt(t) * champ.perStack + (champ.unit === "AP" ? evilAP(t) : 0);
    const abilityAt = (t) => {
      const a = champ.ability;
      if (!a) return null;
      if (champ.unit === "AP") return a.base + a.ratio * (statAt(t) + extra);
      // Nasus: stacks add straight to Q, AD scales the rest.
      return a.base + stacksAt(t) * champ.perStack + a.ratio * extra;
    };
    const tiersAt = (t) => {
      if (!champ.tiers) return null;
      const n = Math.floor(stacksAt(t) / champ.tiers.every);
      return { count: n, range: n * champ.tiers.range, crit: n * champ.tiers.crit };
    };
    const timeFor = (stacks) => (stacks <= 0 ? 0 : perMinute > 0 ? stacks / perMinute : null);

    const row = (t) => ({ minute: t, stacks: stacksAt(t), stat: statAt(t), ability: abilityAt(t), tiers: tiersAt(t), evil: evilAP(t) });
    const end = Math.max(30, Math.ceil(minutes));
    const series = [];
    for (let t = 0; t <= end; t += 0.5) series.push(statAt(t));

    return {
      champion: champ, perMinute, minutes, now: row(minutes),
      checkpoints: CHECKPOINTS.map(row), series, end,
      events: champ.events.map((e) => ({ ...e, rate: rateOf(e), perMinute: rateOf(e) * e.stacks })),
      milestones: (champ.milestones || []).map((m) => ({ ...m, minute: timeFor(m.at) })),
      target: build.target > 0 ? { stacks: build.target, minute: timeFor(build.target) } : null,
      evil: evil.on ? { start: evilStart, perMinute: evilPerMinute, total: evilAP(minutes) } : null,
    };
  }

  const api = { compute, CHECKPOINTS };
  if (typeof module !== "undefined") module.exports = api;
  else root.StackingCalc = api;
})(this);
