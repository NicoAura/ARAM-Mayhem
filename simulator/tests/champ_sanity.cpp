// Sanity checks for the all-champion simulator. Exits non-zero on any failure.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>

#include "../src/champ.hpp"

using namespace mayhem;

static int failures = 0;
#define CHECK(cond, msg)                                              \
    do {                                                              \
        if (!(cond)) { std::printf("FAIL: %s\n", msg); ++failures; } \
        else std::printf("ok:   %s\n", msg);                          \
    } while (0)

static double meanDps(const Library& lib, const ChampionKit& c, const Build& b, const Scenario& sc, int n = 1500) {
    return summarize(runTrials(lib, c, b, sc, 0, n)).meanDps;
}

static bool has(const std::vector<std::string>& v, const char* x) { return std::find(v.begin(), v.end(), x) != v.end(); }

int main(int argc, char** argv) {
    const Library lib = Library::load(argc > 1 ? argv[1] : "data/mayhem_rules.json");

    CHECK(lib.champions.size() >= 170, "loads every champion (170+)");
    CHECK(lib.items.size() >= 80 && lib.augments.size() >= 10, "loads items and augments");
    size_t withAbilities = 0;
    for (const auto& c : lib.champions) withAbilities += c.abilities.empty() ? 0 : 1;
    CHECK(withAbilities >= 165, "almost every champion has damaging abilities");

    const ChampionKit* ahri = lib.find("Ahri");
    const ChampionKit* jinx = lib.find("jinx");
    const ChampionKit* lux = lib.find("99");
    CHECK(ahri && jinx && lux, "finds champions by id, name or number");
    if (!ahri || !jinx || !lux) return 1;

    const Scenario sc = lib.scenarioFor(*ahri);
    bool selfFree = true;
    for (const auto& e : sc.enemies) selfFree &= e.championId != ahri->championId;
    CHECK(selfFree && sc.enemies.size() > 100, "enemy pool has 100+ champions and never the champion itself");

    const Build naked{{}, {}};
    const Build cap{{"rabadons"}, {}};
    auto a = runTrials(lib, *ahri, cap, sc, 0, 400);
    auto b1 = runTrials(lib, *ahri, cap, sc, 0, 200);
    auto b2 = runTrials(lib, *ahri, cap, sc, 200, 200);
    bool same = true;
    for (size_t i = 0; i < 200; ++i) {
        same &= a[i].totalDamage == b1[i].totalDamage;
        same &= a[i + 200].totalDamage == b2[i].totalDamage;
    }
    CHECK(same, "results do not depend on how trials are split across workers");

    bool sane = true;
    for (const auto& r : a) sane &= r.totalDamage >= r.primaryDamage && r.primaryDamage >= 0 && r.duration > 0;
    CHECK(sane, "total damage >= single-target damage >= 0");

    CHECK(meanDps(lib, *ahri, cap, sc) > meanDps(lib, *ahri, naked, sc), "an AP item adds damage to an AP champion");
    const Scenario jsc = lib.scenarioFor(*jinx);
    CHECK(meanDps(lib, *jinx, Build{{"infinity_edge"}, {}}, jsc) > meanDps(lib, *jinx, Build{{"rabadons"}, {}}, jsc),
          "a marksman gets more from Infinity Edge than from Rabadon's");

    Scenario tanky = sc;
    tanky.fixedTarget = true;
    tanky.targetArmor = tanky.targetMr = 300;
    CHECK(meanDps(lib, *ahri, cap, tanky) < meanDps(lib, *ahri, cap, sc), "more resists means less damage");

    Scenario peaceful = sc;
    peaceful.enemyDpsMean = peaceful.enemyDpsSd = 0;
    CHECK(summarize(runTrials(lib, *ahri, naked, peaceful, 0, 500)).survivalRate == 1.0,
          "nobody dies without enemy damage");

    ChampionKit nerfed = *ahri;
    nerfed.damageDealt = 0.8;
    CHECK(meanDps(lib, nerfed, cap, sc) < meanDps(lib, *ahri, cap, sc), "Mayhem damage-dealt nerfs lower damage");

    const auto luxRoles = fittingRoles(*lux), jinxRoles = fittingRoles(*jinx);
    CHECK(has(luxRoles, "ap") && !has(luxRoles, "crit"), "Lux searches AP items, not crit");
    CHECK(has(jinxRoles, "crit") && has(jinxRoles, "onhit"), "Jinx searches crit and on-hit items");

    Library quick = lib;
    quick.optimizer.screenTrials = 24;
    quick.optimizer.finalTrials = 400;
    quick.optimizer.candidates = 8;
    quick.optimizer.finalists = 4;
    const auto ranked = optimize(quick, *ahri, sc, 2, 3);
    const Build manual{{"sorcerers", "rabadons", "void_staff", "shadowflame", "cryptbloom", "horizon_focus"}, {}};
    const double manualDps = meanDps(quick, *ahri, manual, sc, 400);
    CHECK(!ranked.empty() && ranked.front().build.items.size() == 6 && ranked.front().build.augments.size() == 4,
          "optimizer returns boots, five legendaries and four augments");
    CHECK(!ranked.empty() && ranked.front().summary.meanDps >= manualDps,
          "optimized build beats a hand-picked AP build without augments");

    const FightTrace tr = traceFight(lib, *ahri, cap, sc, 7);
    const Result plain = runTrials(lib, *ahri, cap, sc, 7, 1).front();
    double traced = 0;
    bool ordered = true, cast = false;
    for (size_t i = 0; i < tr.events.size(); ++i) {
        const auto& e = tr.events[i];
        if (e.kind == "damage") traced += e.amount;
        cast |= e.kind == "cast";
        if (i) ordered &= e.t >= tr.events[i - 1].t;
    }
    CHECK(tr.result.totalDamage == plain.totalDamage && std::abs(traced - plain.totalDamage) < 1e-6 * plain.totalDamage,
          "a recorded fight matches the same fight unrecorded, and its damage events add up");
    CHECK(ordered && cast && !tr.events.empty() && tr.events.back().kind == "end", "fight recordings are in time order");

    {
        Library harsh = Library::load(argc > 1 ? argv[1] : "data/mayhem_rules.json", {{"enemy_damage_scale", 3.0}});
        CHECK(summarize(runTrials(harsh, *harsh.find("Ahri"), cap, harsh.scenarioFor(*harsh.find("Ahri")), 0, 800)).survivalRate <
                  summarize(runTrials(lib, *ahri, cap, sc, 0, 800)).survivalRate,
              "tripling enemy damage lowers survival");
        Library picked = lib;
        picked.enemyTeam = {"Malphite:hp=6000:armor=300", "Brand"};
        const Scenario psc = picked.scenarioFor(*ahri);
        bool ok = psc.enemies.size() == 2 && psc.teamSize == 2;
        for (const auto& e : psc.enemies) if (e.id == "Malphite") ok &= e.hp == 6000 && e.armor == 300;
        CHECK(ok, "a picked enemy team uses exactly those champions with their changed stats");
        bool rejected = false;
        try { Library::load(argc > 1 ? argv[1] : "data/mayhem_rules.json", {{"not_a_setting", 1}}); } catch (...) { rejected = true; }
        CHECK(rejected, "unknown settings are rejected");
    }

    bool threw = false;
    try { runTrials(lib, *ahri, Build{{"not_an_item"}, {}}, sc, 0, 1); } catch (...) { threw = true; }
    CHECK(threw, "unknown item ids are rejected");

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "PASSED", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
