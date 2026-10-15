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
