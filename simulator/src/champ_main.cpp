// Command-line front end for the all-champion simulator.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "champ.hpp"

#ifndef MAYHEM_DEFAULT_RULES
#define MAYHEM_DEFAULT_RULES "data/mayhem_rules.json"
#endif

using namespace mayhem;

namespace {

void usage() {
    std::cout <<
R"(ARAM Mayhem all-champion simulator

Usage: mayhem_sim [options]

  --champ NAME        champion to simulate (name or id, e.g. Ahri, MissFortune, 103)
  --items a,b,...     simulate this build instead of searching for the best one
  --augs a,b,...      augments for --items
  --all               find the best build for every champion and compare with
                      China-server damage shares
  --kit NAME          show what the simulator read from a champion's abilities
  --any-items         search every item, not just ones that fit the champion
  --list              list champions, items and augments
  --trials N          fights per build in the final comparison
  --seed N            RNG seed
  --threads N         worker threads (default: all cores)
  --rules PATH        rules file (default )" MAYHEM_DEFAULT_RULES R"()
  --json              print results as JSON
  --trace FILE        with --champ: also write one typical fight (the median-DPS
                      one of 200) of the best or given build, for the animated replay
  --trace-dir DIR     with --all: write a replay trace for every champion's best build
  --set k=v,k=v       change fight or model settings (--list --json shows them all),
                      e.g. --set level=13,fight_mean=12,enemy_damage_scale=1.5
  --team a,b,...      fight exactly these enemy champions; change one's stats with
                      Name:hp=5000:armor=250 (hp, armor, mr, damage_share, phys_share,
                      cc, damage_taken)
  --combo EQRW        with --champ: cast order when several abilities are ready
                      (default: the champion's recommended combo, data/combos.json)
  --list --json       champions, items, augments, settings and the enemy pool as JSON
  --help              show this help
)";
}

std::vector<std::string> splitList(const std::string& s) {
    std::vector<std::string> out;
    std::stringstream ss(s);
    std::string part;
    while (std::getline(ss, part, ','))
        if (!part.empty()) out.push_back(part);
    return out;
}

std::string join(const std::vector<std::string>& v, const char* sep = ", ") {
    std::string out;
    for (size_t i = 0; i < v.size(); ++i) out += (i ? sep : "") + v[i];
    return out;
}

std::string jsonStr(const std::string& s) {
    std::string out = "\"";
    for (char ch : s) {
        if (ch == '"' || ch == '\\') out += '\\';
        out += ch;
    }
    return out + "\"";
}

std::string buildNames(const Library& lib, const Build& b) {
    std::vector<std::string> items, augs;
    for (const auto& i : b.items) items.push_back(lib.items.at(i).name);
    for (const auto& a : b.augments) augs.push_back(lib.augments.at(a).name);
    return join(items) + (augs.empty() ? "" : " | " + join(augs));
}

std::string buildJson(const Build& b) {
    std::string s = "{\"items\": [";
    for (size_t i = 0; i < b.items.size(); ++i) s += (i ? ", " : "") + jsonStr(b.items[i]);
    s += "], \"augments\": [";
    for (size_t i = 0; i < b.augments.size(); ++i) s += (i ? ", " : "") + jsonStr(b.augments[i]);
    return s + "]}";
}

std::string summaryJson(const Summary& s);

std::string num(double v) {
    char buf[32];
    std::snprintf(buf, sizeof buf, "%.3f", v);
    std::string s = buf;
    while (s.back() == '0') s.pop_back();
    if (s.back() == '.') s.pop_back();
    return s == "-0" ? "0" : s;
}

// The fight with the median DPS out of the first 200, so a replay shows a typical fight.
uint64_t typicalTrial(const Library& lib, const ChampionKit& c, const Build& b, const Scenario& sc) {
    const auto res = runTrials(lib, c, b, sc, 0, 200);
    std::vector<std::pair<double, size_t>> dps;
    for (size_t i = 0; i < res.size(); ++i) dps.push_back({res[i].totalDamage / res[i].duration, i});
    std::sort(dps.begin(), dps.end());
    return dps[dps.size() / 2].second;
}

// Writes a fight trace for the replay viewer (viewer/). Short keys keep the files small.
bool writeTrace(const Library& lib, const ChampionKit& c, const Build& b, const Scenario& sc, const Summary& summary,
                const std::string& path) {
    const uint64_t trial = typicalTrial(lib, c, b, sc);
    const FightTrace tr = traceFight(lib, c, b, sc, trial);
    std::ostringstream o;
    o << "{\"champion\": " << jsonStr(c.id) << ", \"name\": " << jsonStr(c.name) << ", \"key\": " << c.championId
      << ", \"role\": " << jsonStr(c.role) << ", \"ranged\": " << (c.ranged ? "true" : "false")
      << ", \"range\": " << num(c.attackRange) << ", \"parse_quality\": " << jsonStr(c.parseQuality);
    o << ",\n \"build\": {\"items\": [";
    for (size_t i = 0; i < b.items.size(); ++i)
        o << (i ? ", " : "") << "{\"key\": " << jsonStr(b.items[i]) << ", \"id\": " << lib.items.at(b.items[i]).id
          << ", \"name\": " << jsonStr(lib.items.at(b.items[i]).name) << "}";
    o << "], \"augments\": [";
    for (size_t i = 0; i < b.augments.size(); ++i)
        o << (i ? ", " : "") << "{\"key\": " << jsonStr(b.augments[i]) << ", \"name\": "
          << jsonStr(lib.augments.at(b.augments[i]).name) << "}";
    o << "]},\n \"abilities\": [";
    for (size_t i = 0; i < c.abilities.size(); ++i) {
        const Ability& a = c.abilities[i];
        o << (i ? ", " : "") << "{\"slot\": \"" << a.slot << "\", \"name\": " << jsonStr(a.name)
          << ", \"cooldown\": " << num(a.cooldown) << ", \"passive\": " << (a.aura || a.onhitEvery > 0 ? "true" : "false")
          << ", \"range\": " << num(a.geo.range) << ", \"radius\": " << num(a.geo.radius)
          << ", \"width\": " << num(a.geo.width) << ", \"angle\": " << num(a.geo.angle) << "}";
    }
    o << "],\n \"summary\": " << summaryJson(summary);
    o << ",\n \"fight\": {\"trial\": " << trial << ", \"seed\": " << sc.seed << ", \"duration\": " << num(tr.result.duration)
      << ", \"engage_at\": " << num(tr.engageAt) << ", \"max_hp\": " << num(tr.maxHp)
      << ", \"died\": " << (tr.result.died ? "true" : "false") << ", \"time_alive\": " << num(tr.result.timeAlive)
      << ", \"total_damage\": " << num(tr.result.totalDamage) << ", \"kills\": " << tr.result.kills << ", \"team\": [";
    for (size_t i = 0; i < tr.team.size(); ++i) o << (i ? ", " : "") << jsonStr(tr.team[i]);
    o << "]},\n \"sources\": [";
    for (int i = 0; i < SrcCount; ++i) o << (i ? ", " : "") << jsonStr(kSourceNames[i]);
    o << "],\n \"events\": [";
    for (size_t i = 0; i < tr.events.size(); ++i) {
        const TraceEvent& e = tr.events[i];
        o << (i ? ",\n  " : "\n  ") << "{\"t\": " << num(e.t) << ", \"k\": \"" << e.kind << "\"";
        if (e.target >= 0) o << ", \"u\": " << e.target;
        if (e.slot) o << ", \"s\": \"" << e.slot << "\"";
        if (!e.text.empty()) o << ", \"x\": " << jsonStr(e.text);
        if (e.source >= 0) o << ", \"src\": " << e.source;
        if (e.amount != 0) o << ", \"a\": " << num(e.amount);
        if (e.kind == "spawn" || e.kind == "damage" || e.kind == "kill" || e.kind == "self" || e.kind == "death")
            o << ", \"hp\": " << num(e.hp) << ", \"max\": " << num(e.maxHp);
        if (e.flag) o << ", \"f\": 1";
        if (e.kind == "cast" || e.kind == "poro") o << ", \"ax\": " << std::lround(e.x) << ", \"ay\": " << std::lround(e.y) << ", \"fl\": " << num(e.flight);
        if (!e.pos.empty()) {
            o << ", \"p\": [";  // uid, x, y for everyone standing; uid -1 is the champion
            for (size_t j = 0; j < e.pos.size(); ++j) o << (j ? "," : "") << std::lround(e.pos[j]);
            o << "]";
        }
        o << "}";
    }
    o << "\n]}\n";
    std::FILE* f = std::fopen(path.c_str(), "w");
    if (!f) { std::cerr << "cannot write " << path << "\n"; return false; }
    const std::string out = o.str();
    std::fwrite(out.data(), 1, out.size(), f);
    std::fclose(f);
    return true;
}

std::string summaryJson(const Summary& s) {
    char buf[512];
    std::snprintf(buf, sizeof buf,
                  "{\"mean_dps\": %.1f, \"ci95\": %.1f, \"p5\": %.1f, \"median\": %.1f, \"p95\": %.1f, "
                  "\"single_target_dps\": %.1f, \"kills_per_minute\": %.3f, \"survival_rate\": %.4f, "
                  "\"time_alive\": %.2f, \"damage_taken_per_s\": %.1f, \"share_by_source\": {",
                  s.meanDps, s.ci95, s.p5, s.median, s.p95, s.singleTargetDps, s.killsPerMinute, s.survivalRate,
                  s.meanTimeAlive, s.damageTakenPerSec);
    std::string out = buf;
    for (int i = 0; i < SrcCount; ++i) {
        std::snprintf(buf, sizeof buf, "%s\"%s\": %.4f", i ? ", " : "", kSourceNames[i], s.shareBySource[i]);
        out += buf;
    }
    return out + "}}";
}

void printKit(const ChampionKit& c) {
    std::printf("%s (%s, %s, parse quality: %s)\n", c.name.c_str(), c.role.c_str(), c.ranged ? "ranged" : "melee",
                c.parseQuality.c_str());
    std::printf("Mayhem: damage dealt x%.2f, taken x%.2f, ability haste %+.0f, attack speed %+.1f%%\n", c.damageDealt,
                c.damageTaken, c.mayhemAh, c.mayhemAs * 100);
    if (c.hasCn)
        std::printf("China-server Mayhem: %.1f%% of team damage, %.1f%% of damage taken, %.1f%% win rate\n",
                    c.cnDamageShare * 100, c.cnTakenShare * 100, c.cnWinRate * 100);
    for (const auto& a : c.abilities) {
        std::printf("  %c %-28s cd %5.1fs  %s%s\n", a.slot, a.name.c_str(), a.cooldown,
                    a.area == Area::Aoe ? "area" : a.area == Area::Line ? "line" : "single target",
                    a.aura ? ", always on" : "");
        for (const auto& h : a.hits) {
            std::string scale;
            for (const auto& [k, v] : h.scaling) {
                char b[64];
                std::snprintf(b, sizeof b, "%s%g %s", scale.empty() ? "" : " + ", v, k == "const" ? "" : k.c_str());
                scale += b;
            }
            const char* type = h.type == DamageType::Physical ? "physical" : h.type == DamageType::Magic ? "magic" : "true";
            const char* tgt = h.target == HitTarget::MaxHp       ? " x target max HP"
                              : h.target == HitTarget::CurrentHp ? " x target current HP"
                              : h.target == HitTarget::MissingHp ? " x target missing HP"
                                                                 : "";
            std::printf("      %-8s %s%s%s  (weight %.2f)\n", type, scale.c_str(), tgt, h.perSecond ? " per second" : "",
                        h.weight);
        }
    }
}

void printRanked(const Library& lib, const ChampionKit& c, const std::vector<Ranked>& ranked) {
    std::printf("\n%s: best builds (mean DPS over the whole fight; dying early counts against a build)\n\n",
                c.name.c_str());
    std::printf("%-4s %7s %6s %7s %8s  %s\n", "#", "DPS", "+-95%", "Kills/m", "Survives", "Build");
    int i = 0;
    for (const auto& r : ranked) {
        std::printf("%-4d %7.0f %6.0f %7.2f %7.0f%%  %s\n", ++i, r.summary.meanDps, r.summary.ci95,
                    r.summary.killsPerMinute, r.summary.survivalRate * 100, buildNames(lib, r.build).c_str());
    }
    if (!ranked.empty()) {
        std::printf("\nDamage by source for #1:");
        for (int s = 0; s < SrcCount; ++s)
            if (ranked[0].summary.shareBySource[s] > 0.005)
                std::printf("  %s %.0f%%", kSourceNames[s], ranked[0].summary.shareBySource[s] * 100);
        std::printf("\n");
    }
}

double spearman(std::vector<double> a, std::vector<double> b) {
    auto ranks = [](const std::vector<double>& v) {
        std::vector<size_t> idx(v.size());
        for (size_t i = 0; i < idx.size(); ++i) idx[i] = i;
        std::sort(idx.begin(), idx.end(), [&](size_t x, size_t y) { return v[x] < v[y]; });
        std::vector<double> r(v.size());
        for (size_t i = 0; i < idx.size(); ++i) r[idx[i]] = static_cast<double>(i);
        return r;
    };
    const auto ra = ranks(a), rb = ranks(b);
    const double n = static_cast<double>(a.size());
    double d2 = 0;
    for (size_t i = 0; i < a.size(); ++i) d2 += (ra[i] - rb[i]) * (ra[i] - rb[i]);
    return 1.0 - 6.0 * d2 / (n * (n * n - 1.0));
}

}  // namespace

int main(int argc, char** argv) {
    std::string rulesPath = MAYHEM_DEFAULT_RULES, champName, kitName;
    std::vector<std::string> items, augs;
    bool all = false, asJson = false, list = false, customBuild = false, anyItems = false;
    std::string tracePath, traceDir, combo;
    Library::Settings settings;
    std::vector<std::string> team;
    int trials = 0;
    long long seed = -1;
#ifdef __EMSCRIPTEN__
    int threads = 1;
#else
    int threads = static_cast<int>(std::max(1u, std::thread::hardware_concurrency()));
#endif
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        auto next = [&]() -> std::string {
            if (i + 1 >= argc) { std::cerr << a << " needs a value\n"; std::exit(2); }
            return argv[++i];
        };
        if (a == "--help" || a == "-h") { usage(); return 0; }
        else if (a == "--rules") rulesPath = next();
        else if (a == "--champ") champName = next();
        else if (a == "--kit") kitName = next();
        else if (a == "--items") { items = splitList(next()); customBuild = true; }
        else if (a == "--augs") augs = splitList(next());
        else if (a == "--all") all = true;
        else if (a == "--any-items") anyItems = true;
        else if (a == "--list") list = true;
        else if (a == "--json") asJson = true;
        else if (a == "--trace") tracePath = next();
        else if (a == "--trace-dir") traceDir = next();
        else if (a == "--team") team = splitList(next());
        else if (a == "--combo") combo = next();
        else if (a == "--set") {
            for (const auto& kv : splitList(next())) {
                const auto eq = kv.find('=');
                if (eq == std::string::npos) { std::cerr << "--set needs key=value, got " << kv << "\n"; return 2; }
                try {
                    settings[kv.substr(0, eq)] = std::stod(kv.substr(eq + 1));
                } catch (...) { std::cerr << "--set " << kv << ": not a number\n"; return 2; }
            }
        }
        else if (a == "--trials") trials = std::stoi(next());
        else if (a == "--seed") seed = std::stoll(next());
        else if (a == "--threads") threads = std::max(1, std::stoi(next()));
        else { std::cerr << "unknown option " << a << "\n"; usage(); return 2; }
    }

    Library lib;
    try {
        lib = Library::load(rulesPath, settings);
        lib.enemyTeam = team;
        if (!combo.empty()) {
            if (champName.empty()) throw std::runtime_error("--combo needs --champ");
            const ChampionKit* c = lib.find(champName);
            if (c) Library::setCombo(lib.champions[static_cast<size_t>(c - lib.champions.data())], combo);
        }
    } catch (const std::exception& e) {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
    if (trials > 0) lib.optimizer.finalTrials = trials;
    if (anyItems) lib.optimizer.fittingItemsOnly = false;
    if (seed >= 0) lib.scenario.seed = static_cast<uint64_t>(seed);

    if (list && asJson) {
        std::printf("{\"champions\": [");
        for (size_t i = 0; i < lib.champions.size(); ++i) {
            const auto& c = lib.champions[i];
            std::printf("%s{\"id\": %s, \"name\": %s, \"role\": %s, \"ranged\": %s, \"combo\": %s}", i ? ", " : "",
                        jsonStr(c.id).c_str(), jsonStr(c.name).c_str(), jsonStr(c.role).c_str(), c.ranged ? "true" : "false",
                        jsonStr(c.combo).c_str());
        }
        auto effects = [&](const std::map<std::string, Effect>& m) {
            bool first = true;
            for (const auto& [k, e] : m) {
                std::string roles;
                for (size_t i = 0; i < e.roles.size(); ++i) roles += (i ? ", " : "") + jsonStr(e.roles[i]);
                std::printf("%s{\"key\": %s, \"name\": %s, \"slot\": %s, \"rarity\": %s, \"roles\": [%s]}",
                            first ? "" : ", ", jsonStr(k).c_str(), jsonStr(e.name).c_str(), jsonStr(e.slot).c_str(),
                            jsonStr(e.rarity).c_str(), roles.c_str());
                first = false;
            }
        };
        std::printf("],\n \"items\": [");
        effects(lib.items);
        std::printf("],\n \"augments\": [");
        effects(lib.augments);
        const Scenario& sc = lib.scenario;
        const Rules& r = lib.rules;
        const std::map<std::string, double> defaults = {
            {"level", sc.level}, {"fight_mean", sc.fightMean}, {"fight_sd", sc.fightSd}, {"fight_min", sc.fightMin},
            {"fight_max", sc.fightMax}, {"engage_min", sc.engageMin}, {"engage_max", sc.engageMax},
            {"enemy_damage_scale", 1}, {"cc_scale", 1}, {"cc_min", sc.ccMin}, {"cc_max", sc.ccMax},
            {"start_distance", sc.startDistance}, {"enemy_spread", sc.enemySpread}, {"r_ready_chance", sc.rReadyChance},
            {"retarget_delay", sc.retargetDelay}, {"fixed_target", 0}, {"target_hp", sc.targetHp},
            {"target_armor", sc.targetArmor}, {"target_mr", sc.targetMr}, {"dodge_chance", r.dodgeChance},
            {"reaction_time", r.reactionTime}, {"aim_lead", r.aimLead}, {"combo_order", r.comboOrder}};
        std::printf("],\n \"settings\": [");
        bool first = true;
        for (const auto& [k, desc] : Library::settingKeys()) {
            std::printf("%s{\"key\": %s, \"default\": %s, \"description\": %s}", first ? "" : ", ", jsonStr(k).c_str(),
                        num(defaults.at(k)).c_str(), jsonStr(desc).c_str());
            first = false;
        }
        std::printf("],\n \"enemies\": [");
        Scenario pool = lib.scenario;
        if (lib.enemyPool.isObject()) pool.applyEnemyPool(lib.enemyPool);
        for (size_t i = 0; i < pool.enemies.size(); ++i) {
            const auto& e = pool.enemies[i];
            const auto it = lib.mayhemDamageTaken.find(e.championId);
            std::printf("%s{\"id\": %s, \"name\": %s, \"weight\": %s, \"hp\": %s, \"armor\": %s, \"mr\": %s, "
                        "\"damage_share\": %s, \"phys_share\": %s, \"cc\": %s, \"damage_taken\": %s}",
                        i ? ", " : "", jsonStr(e.id).c_str(), jsonStr(e.name).c_str(), num(e.weight).c_str(),
                        num(e.hp).c_str(), num(e.armor).c_str(), num(e.mr).c_str(), num(e.damageShare).c_str(),
                        num(e.physShare).c_str(), num(e.cc).c_str(),
                        num(it != lib.mayhemDamageTaken.end() ? it->second : e.damageTaken).c_str());
        }
        std::printf("]}\n");
        return 0;
    }
    if (list) {
        std::printf("Champions (%zu):\n", lib.champions.size());
        for (const auto& c : lib.champions) std::printf("  %-14s %-9s parse %s\n", c.id.c_str(), c.role.c_str(), c.parseQuality.c_str());
        std::printf("\nItems:\n");
        for (const auto& [k, e] : lib.items) std::printf("  %-20s %-30s %s\n", k.c_str(), e.name.c_str(), e.confidence.c_str());
        std::printf("\nAugments:\n");
        for (const auto& [k, e] : lib.augments) std::printf("  %-20s %-22s %-9s %s\n", k.c_str(), e.name.c_str(), e.rarity.c_str(), e.confidence.c_str());
        return 0;
    }
    if (!kitName.empty()) {
        const ChampionKit* c = lib.find(kitName);
        if (!c) { std::cerr << "unknown champion " << kitName << "\n"; return 2; }
        printKit(*c);
        return 0;
    }

    try {
        if (!champName.empty()) {
            const ChampionKit* c = lib.find(champName);
            if (!c) { std::cerr << "unknown champion " << champName << "\n"; return 2; }
            const Scenario sc = lib.scenarioFor(*c);
            std::vector<Ranked> ranked;
            if (customBuild) {
                Build b{items, augs};
                lib.validate(b);
                const int n = lib.optimizer.finalTrials;
#ifdef __EMSCRIPTEN__
                // No threads in the browser build: the page runs the simulator in a Web Worker.
                const std::vector<Result> res = runTrials(lib, *c, b, sc, 0, n);
#else
                std::vector<Result> res(static_cast<size_t>(n));
                std::vector<std::thread> pool;
                const int t = std::max(1, std::min(threads, n));
                for (int w = 0; w < t; ++w)
                    pool.emplace_back([&, w] {
                        const int from = n * w / t, to = n * (w + 1) / t;
                        auto part = runTrials(lib, *c, b, sc, static_cast<uint64_t>(from), to - from);
                        std::copy(part.begin(), part.end(), res.begin() + from);
                    });
                for (auto& th : pool) th.join();
#endif
                ranked.push_back({b, summarize(res)});
            } else {
                ranked = optimize(lib, *c, sc, threads);
            }
            if (!tracePath.empty() && !writeTrace(lib, *c, ranked.front().build, sc, ranked.front().summary, tracePath))
                return 1;
            if (asJson) {
                std::printf("{\"champion\": %s, \"builds\": [", jsonStr(c->id).c_str());
                for (size_t i = 0; i < ranked.size(); ++i)
                    std::printf("%s{\"build\": %s, \"summary\": %s}", i ? ", " : "", buildJson(ranked[i].build).c_str(),
                                summaryJson(ranked[i].summary).c_str());
                std::printf("]}\n");
            } else {
                printKit(*c);
                printRanked(lib, *c, ranked);
            }
            return 0;
        }

        if (all) {
            struct Row { const ChampionKit* c; Ranked best; };
            std::vector<Row> rows(lib.champions.size());
            std::atomic<size_t> nextIdx{0};
            std::mutex logMu;
            std::vector<std::thread> pool;
            for (int w = 0; w < threads; ++w)
                pool.emplace_back([&] {
                    for (size_t i; (i = nextIdx++) < lib.champions.size();) {
                        const ChampionKit& c = lib.champions[i];
                        const auto ranked = optimize(lib, c, lib.scenarioFor(c), 1, 1);
                        rows[i] = {&c, ranked.front()};
                        if (!traceDir.empty())
                            writeTrace(lib, c, ranked.front().build, lib.scenarioFor(c), ranked.front().summary,
                                       traceDir + "/" + c.id + ".json");
                        std::lock_guard<std::mutex> lock(logMu);
                        std::fprintf(stderr, "\r%zu/%zu %-14s", i + 1, lib.champions.size(), c.id.c_str());
                    }
                });
            for (auto& th : pool) th.join();
            std::fprintf(stderr, "\n");
            std::sort(rows.begin(), rows.end(),
                      [](const Row& a, const Row& b) { return a.best.summary.meanDps > b.best.summary.meanDps; });

            // How well the simulated damage lines up with real China-server damage shares.
            std::vector<double> sim, real;
            for (const auto& r : rows)
                if (r.c->hasCn && r.c->parseQuality == "good") {
                    sim.push_back(r.best.summary.meanDps);
                    real.push_back(r.c->cnDamageShare);
                }
            const double rho = sim.size() > 2 ? spearman(sim, real) : 0.0;

            if (asJson) {
                std::printf("{\"spearman_vs_cn_damage_share\": %.3f, \"champions\": [\n", rho);
                for (size_t i = 0; i < rows.size(); ++i) {
                    const auto& r = rows[i];
                    std::printf("%s{\"champion\": %s, \"name\": %s, \"role\": %s, \"parse_quality\": %s, "
                                "\"cn_damage_share\": %s, \"build\": %s, \"summary\": %s}",
                                i ? ",\n" : "", jsonStr(r.c->id).c_str(), jsonStr(r.c->name).c_str(),
                                jsonStr(r.c->role).c_str(), jsonStr(r.c->parseQuality).c_str(),
                                r.c->hasCn ? std::to_string(r.c->cnDamageShare).c_str() : "null",
                                buildJson(r.best.build).c_str(), summaryJson(r.best.summary).c_str());
                }
                std::printf("\n]}\n");
            } else {
                std::printf("%-4s %-14s %-9s %-7s %6s %8s %7s  %s\n", "#", "Champion", "Role", "Parse", "DPS",
                            "Survives", "CN dmg", "Best build");
                int i = 0;
                for (const auto& r : rows) {
                    char cn[16] = "  -";
                    if (r.c->hasCn) std::snprintf(cn, sizeof cn, "%5.1f%%", r.c->cnDamageShare * 100);
                    std::printf("%-4d %-14s %-9s %-7s %6.0f %7.0f%% %7s  %s\n", ++i, r.c->id.c_str(), r.c->role.c_str(),
                                r.c->parseQuality.c_str(), r.best.summary.meanDps, r.best.summary.survivalRate * 100, cn,
                                buildNames(lib, r.best.build).c_str());
                }
                std::printf("\nRank correlation between simulated DPS and China-server damage share "
                            "(champions with a good parse): %.2f over %zu champions\n",
                            rho, sim.size());
            }
            return 0;
        }
    } catch (const std::exception& e) {
        std::cerr << "error: " << e.what() << "\n";
        return 1;
    }
    usage();
    return 2;
}
