// Sanity checks for the simulator core. Exits non-zero on the first failure.
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "../src/sim.hpp"

using namespace yunara;

static int failures = 0;
#define CHECK(cond, msg)                                         \
    do {                                                         \
        if (!(cond)) { std::printf("FAIL: %s\n", msg); ++failures; } \
        else std::printf("ok:   %s\n", msg);                     \
    } while (0)

static double meanDps(const GameData& d, const Build& b, const Scenario& sc) {
    return summarize(runTrials(d, b, sc, 0, sc.trials)).meanDps;
}

int main(int argc, char** argv) {
    std::string path = argc > 1 ? argv[1] : "data/yunara_mayhem.json";
    std::ifstream in(path);
    if (!in) { std::printf("cannot open %s\n", path.c_str()); return 1; }
    std::stringstream ss;
    ss << in.rdbuf();
    GameData d = GameData::fromJson(json::parse(ss.str()));

    Scenario sc = d.scenario;
    sc.trials = 2000;

    for (const auto& id : d.buildOrder) {
        bool ok = true;
        try { d.validate(d.builds.at(id)); } catch (...) { ok = false; }
        CHECK(ok, ("preset build '" + id + "' only uses known items and augments").c_str());
    }

    for (const auto& id : d.buildOrder) {
        bool offered = true;
        for (const auto& aug : d.builds.at(id).augments) offered &= d.augments.at(aug).offeredToYunara;
        CHECK(offered, ("preset build '" + id + "' only uses augments confirmed for Yunara").c_str());
    }

    const Build& crit = d.builds.at("crit_classic");
    auto a = runTrials(d, crit, sc, 0, 500);
    auto b1 = runTrials(d, crit, sc, 0, 250);
    auto b2 = runTrials(d, crit, sc, 250, 250);
    bool same = true;
    for (size_t i = 0; i < 250; ++i) {
        same &= a[i].totalDamage == b1[i].totalDamage;
        same &= a[i + 250].totalDamage == b2[i].totalDamage;
    }
    CHECK(same, "results do not depend on how trials are split across workers");

    bool sane = true;
    for (const auto& r : a) sane &= r.totalDamage >= r.primaryDamage && r.primaryDamage >= 0 && r.duration > 0;
    CHECK(sane, "total damage >= single-target damage >= 0");

    Build naked{"naked", "No items", {}, {}};
    Build ie{"ie", "IE only", {"ie"}, {}};
    CHECK(meanDps(d, ie, sc) > meanDps(d, naked, sc), "an item adds damage");

    Scenario tanky = sc;
    tanky.fixedTarget = true;
    tanky.targetArmor = 300;
    tanky.targetMr = 300;
    CHECK(meanDps(d, crit, tanky) < meanDps(d, crit, sc), "more resists means less damage");

    Scenario grouped = sc, alone = sc;
    grouped.clumpMax = 4; grouped.clumpChance = 1.0;
    alone.clumpMax = 0;
    CHECK(meanDps(d, crit, grouped) > meanDps(d, crit, alone), "grouped enemies take spread damage");

    Scenario noW = sc;
    noW.wHitChance = 0.0;
    CHECK(meanDps(d, crit, noW) < meanDps(d, crit, sc), "missing every W lowers damage");

    Scenario brutal = sc, peaceful = sc;
    brutal.enemyDpsMean = 2000;
    peaceful.enemyDpsMean = 0; peaceful.enemyDpsSd = 0;
    const Summary sb = summarize(runTrials(d, crit, brutal, 0, sc.trials));
    const Summary sp = summarize(runTrials(d, crit, peaceful, 0, sc.trials));
    CHECK(sb.meanDps < sp.meanDps, "heavy enemy damage lowers DPS");
    CHECK(sp.survivalRate == 1.0 && sb.survivalRate < 0.5, "she survives without enemy damage and dies under heavy damage");

    Build tanky_build{"tb", "IE + HP", {"ie", "heartsteel_hp"}, {}};
    CHECK(summarize(runTrials(d, tanky_build, sc, 0, sc.trials)).meanTimeAlive >
              summarize(runTrials(d, ie, sc, 0, sc.trials)).meanTimeAlive,
          "health items keep her alive longer");

    Scenario fixedTank = sc, fixedSquishy = sc;
    fixedTank.fixedTarget = fixedSquishy.fixedTarget = true;
    fixedTank.targetHp = 5800; fixedTank.targetArmor = 260; fixedTank.targetMr = 160;
    fixedSquishy.targetHp = 3000; fixedSquishy.targetArmor = 95; fixedSquishy.targetMr = 60;
    CHECK(summarize(runTrials(d, crit, fixedTank, 0, sc.trials)).killsPerMinute <
              summarize(runTrials(d, crit, fixedSquishy, 0, sc.trials)).killsPerMinute,
          "tanks die slower than squishies");

    if (argc > 2) {
        std::ifstream pin(argv[2]);
        std::stringstream ps;
        ps << pin.rdbuf();
        GameData pooled = d;
        pooled.applyEnemyPool(json::parse(ps.str()));
        CHECK(pooled.scenario.enemies.size() > 100, "enemy pool loads 100+ champions");
        Scenario psc = pooled.scenario;
        psc.trials = 2000;
        const Summary pooledSum = summarize(runTrials(pooled, crit, psc, 0, psc.trials));
        CHECK(pooledSum.meanDps > 0 && pooledSum.survivalRate > 0 && pooledSum.survivalRate < 1,
              "enemy pool fights produce damage and some deaths");
        Scenario noCc = psc;
        noCc.ccRatePerPoint = 0; noCc.ccRateMin = noCc.ccRateMax = 0;
        CHECK(summarize(runTrials(pooled, crit, noCc, 0, psc.trials)).meanDps > pooledSum.meanDps,
              "enemy team CC lowers damage");
    }

    Build bad{"bad", "Bad", {"not_an_item"}, {}};
    bool threw = false;
    try { runTrials(d, bad, sc, 0, 1); } catch (...) { threw = true; }
    CHECK(threw, "unknown item ids are rejected");

    Build needsIe{"x", "x", {"pd"}, {"upgrade_ie"}};
    threw = false;
    try { runTrials(d, needsIe, sc, 0, 1); } catch (...) { threw = true; }
    CHECK(threw, "Upgrade Infinity Edge requires Infinity Edge");

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "PASSED", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
