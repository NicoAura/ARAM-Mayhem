// Augment odds math. Pure functions, no DOM.
//
// Each augment offer shows `cards` different augments drawn at random from that tier's pool.
// Every augment in a tier is treated as equally likely. A reroll redraws the whole offer, so it is one more look at the pool.
(function (root) {
  "use strict";

  const TIERS = ["Silver", "Gold", "Prismatic"];

  // Chance that none of `t` wanted augments is among `c` cards drawn from `n`: C(n-t, c) / C(n, c).
  function missChance(n, t, c) {
    if (t <= 0) return 1;
    if (n - t < c) return 0;
    let p = 1;
    for (let i = 0; i < c; i++) p *= (n - t - i) / (n - i);
    return p;
  }

  // build: { targets: [key...], rounds: {Silver, Gold, Prismatic}, rerolls }
  function compute(data, build) {
    const targets = build.targets.map((k) => data.augments.find((a) => a.key === k)).filter(Boolean);
    const rounds = build.rounds || {};
    const tiers = TIERS.map((tier) => {
      const n = data.augments.filter((a) => a.tier === tier).length;
      const t = targets.filter((a) => a.tier === tier).length;
      const c = data.cards[tier] || 3;
      const miss = missChance(n, t, c);
      return { tier, pool: n, wanted: t, cards: c, offers: Math.max(0, rounds[tier] ?? 0), perOffer: 1 - miss, miss, rerolls: 0 };
    });

    // Spend rerolls where they help most: on a tier you get offers of and that holds a wanted augment.
    let left = Math.max(0, Math.floor(build.rerolls ?? data.rerolls));
    const useful = tiers.filter((x) => x.wanted && x.offers).sort((a, b) => b.perOffer - a.perOffer);
    if (useful.length) useful[0].rerolls = left, left = 0;

    let missGame = 1, missNoReroll = 1;
    for (const x of tiers) {
      x.looks = x.offers + x.rerolls;
      x.perGame = 1 - Math.pow(x.miss, x.looks);
      missGame *= Math.pow(x.miss, x.looks);
      missNoReroll *= Math.pow(x.miss, x.offers);
    }
    const perGame = 1 - missGame;
    return {
      targets, tiers, perGame, withoutRerolls: 1 - missNoReroll, unusedRerolls: left,
      gamesFor: (goal) => (perGame >= 1 ? 1 : perGame <= 0 ? null : Math.ceil(Math.log(1 - goal) / Math.log(1 - perGame))),
    };
  }

  // One random offer of `cards` different augments from a tier (rand is injectable for tests).
  function roll(data, tier, rand = Math.random) {
    const pool = data.augments.filter((a) => a.tier === tier);
    const out = [];
    while (out.length < Math.min(data.cards[tier] || 3, pool.length)) {
      const a = pool[Math.floor(rand() * pool.length)];
      if (!out.includes(a)) out.push(a);
    }
    return out;
  }

  const api = { compute, roll, missChance, TIERS };
  if (typeof module !== "undefined") module.exports = api;
  else root.OddsCalc = api;
})(this);
