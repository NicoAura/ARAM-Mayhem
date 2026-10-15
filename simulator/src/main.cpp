// Command-line front end: loads the data file, splits trials across threads
// and prints a report (or JSON with --json).
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "sim.hpp"

#ifndef YUNARA_DEFAULT_DATA
#define YUNARA_DEFAULT_DATA "data/yunara_mayhem.json"
#endif

using namespace yunara;

namespace {

void usage() {
    std::cout <<
R"(Yunara ARAM Mayhem Monte Carlo DPS simulator

Usage: yunara_sim [options]

  --data PATH          data file (default )" YUNARA_DEFAULT_DATA R"()
  --builds a,b,...     preset builds to run (default: all)
  --items a,b,...      run a custom build with these items
  --augs a,b,...       augments for the custom build
  --trials N           trials per build (default from data file)
  --seed N             RNG seed
  --level N            champion level (1-18)
  --target HP,AR,MR    target health, armor and magic resist
  --fight MEAN,SD      teamfight length in seconds
  --cc-rate R          interrupts per second (0 disables)
  --clump MAX,CHANCE   max grouped enemies and the chance each is in range
  --w-hit P            W hit chance (0-1)
  --r-ready P          chance R is up when the fight starts (0-1)
  --threads N          worker threads (default: all cores)
  --json               print results as JSON
  --list               list items, augments and builds, then exit
  --help               show this help
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

std::vector<double> splitNumbers(const std::string& s, size_t expected, const char* flag) {
    std::vector<double> out;
    for (const auto& p : splitList(s)) out.push_back(std::stod(p));
    if (out.size() != expected) {
        std::cerr << flag << " expects " << expected << " comma-separated numbers\n";
        std::exit(2);
    }
    return out;
}

std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return {};
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

Summary runParallel(const GameData& data, const Build& build, const Scenario& sc, int threads) {
    const int n = std::max(1, std::min(threads, sc.trials));
    if (n == 1) return summarize(runTrials(data, build, sc, 0, sc.trials));
    std::vector<std::vector<TrialResult>> parts(static_cast<size_t>(n));
    std::vector<std::thread> pool;
    const int per = sc.trials / n, extra = sc.trials % n;
    int start = 0;
    for (int i = 0; i < n; ++i) {
        const int count = per + (i < extra ? 1 : 0);
        pool.emplace_back([&, i, start, count] {
            parts[static_cast<size_t>(i)] = runTrials(data, build, sc, static_cast<uint64_t>(start), count);
        });
        start += count;
    }
    for (auto& t : pool) t.join();
    std::vector<TrialResult> all;
    all.reserve(static_cast<size_t>(sc.trials));
    for (auto& p : parts) all.insert(all.end(), p.begin(), p.end());
    return summarize(all);
}

void list(const GameData& d) {
    std::cout << "Items:\n";
    for (const auto& [id, e] : d.items) std::cout << "  " << id << "  (" << e.name << ")\n";
    std::cout << "Augments:\n";
    for (const auto& [id, e] : d.augments)
        std::cout << "  " << id << "  (" << e.name << (e.rarity.empty() ? "" : ", " + e.rarity)
                  << (e.offeredToYunara ? "" : ", not confirmed for Yunara") << ")\n";
    std::cout << "Builds:\n";
    for (const auto& id : d.buildOrder) {
        const Build& b = d.builds.at(id);
        std::cout << "  " << id << "  (" << b.name << "): items ";
        for (size_t i = 0; i < b.items.size(); ++i) std::cout << (i ? "," : "") << b.items[i];
        std::cout << "; augments ";
        for (size_t i = 0; i < b.augments.size(); ++i) std::cout << (i ? "," : "") << b.augments[i];
        std::cout << "\n";
    }
}

std::string jsonEscape(const std::string& s) {
    std::string out;
    for (char c : s) {
        if (c == '"' || c == '\\') out += '\\';
        out += c;
    }
    return out;
}

}  // namespace

int main(int argc, char** argv) {
    std::string dataPath = YUNARA_DEFAULT_DATA;
    std::vector<std::string> buildIds, customItems, customAugs;
    bool asJson = false, doList = false;
#ifdef __EMSCRIPTEN__
    int threads = 1;  // the browser build parallelizes with Web Workers instead
#else
    int threads = static_cast<int>(std::max(1u, std::thread::hardware_concurrency()));
#endif
    std::vector<std::pair<std::string, std::string>> overrides;

    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        auto next = [&]() -> std::string {
            if (i + 1 >= argc) { std::cerr << a << " needs a value\n"; std::exit(2); }
            return argv[++i];
        };
        if (a == "--help" || a == "-h") { usage(); return 0; }
        else if (a == "--data") dataPath = next();
        else if (a == "--builds") buildIds = splitList(next());
        else if (a == "--items") customItems = splitList(next());
        else if (a == "--augs") customAugs = splitList(next());
        else if (a == "--threads") threads = std::max(1, std::stoi(next()));
        else if (a == "--json") asJson = true;
        else if (a == "--list") doList = true;
        else if (a == "--trials" || a == "--seed" || a == "--level" || a == "--target" || a == "--fight" ||
                 a == "--cc-rate" || a == "--clump" || a == "--w-hit" || a == "--r-ready")
            overrides.push_back({a, next()});
        else { std::cerr << "unknown option " << a << " (see --help)\n"; return 2; }
    }

    std::string text = readFile(dataPath);
    if (text.empty()) text = readFile("../" + dataPath);
    if (text.empty()) { std::cerr << "could not read data file " << dataPath << "\n"; return 1; }

    GameData data;
    try {
        data = GameData::fromJson(json::parse(text));
    } catch (const std::exception& e) {
        std::cerr << "bad data file: " << e.what() << "\n";
        return 1;
    }
    if (doList) { list(data); return 0; }

    Scenario sc = data.scenario;
    for (const auto& [flag, v] : overrides) {
        if (flag == "--trials") sc.trials = std::max(1, std::stoi(v));
        else if (flag == "--seed") sc.seed = std::stoull(v);
        else if (flag == "--level") sc.level = std::clamp(std::stoi(v), 1, 18);
        else if (flag == "--target") { auto x = splitNumbers(v, 3, "--target"); sc.targetHp = x[0]; sc.targetArmor = x[1]; sc.targetMr = x[2]; }
        else if (flag == "--fight") { auto x = splitNumbers(v, 2, "--fight"); sc.fightMean = x[0]; sc.fightSd = x[1]; }
        else if (flag == "--cc-rate") sc.ccRate = std::stod(v);
        else if (flag == "--clump") { auto x = splitNumbers(v, 2, "--clump"); sc.clumpMax = static_cast<int>(x[0]); sc.clumpChance = x[1]; }
        else if (flag == "--w-hit") sc.wHitChance = std::stod(v);
        else if (flag == "--r-ready") sc.rReadyChance = std::stod(v);
    }

    std::vector<Build> builds;
    if (!customItems.empty()) {
        builds.push_back(Build{"custom", "Custom", customItems, customAugs});
    } else {
        if (buildIds.empty()) buildIds = data.buildOrder;
        for (const auto& id : buildIds) {
            auto it = data.builds.find(id);
            if (it == data.builds.end()) { std::cerr << "unknown build " << id << " (see --list)\n"; return 2; }
            builds.push_back(it->second);
        }
    }

    for (const auto& b : builds)
        for (const auto& id : b.augments) {
            auto it = data.augments.find(id);
            if (it != data.augments.end() && !it->second.offeredToYunara)
                std::cerr << "warning: " << b.name << " uses " << it->second.name
                          << ", which isn't confirmed as offered to Yunara\n";
        }

    std::vector<std::pair<Build, Summary>> results;
    for (const auto& b : builds) {
        try {
            results.push_back({b, runParallel(data, b, sc, threads)});
        } catch (const std::exception& e) {
            std::cerr << e.what() << "\n";
            return 2;
        }
    }
    std::sort(results.begin(), results.end(),
              [](const auto& a, const auto& b) { return a.second.meanDps > b.second.meanDps; });

    if (asJson) {
        std::printf("{\"level\":%d,\"trials\":%d,\"seed\":%llu,\"target\":{\"hp\":%g,\"armor\":%g,\"mr\":%g},\"builds\":[",
                    sc.level, sc.trials, static_cast<unsigned long long>(sc.seed), sc.targetHp, sc.targetArmor, sc.targetMr);
        for (size_t i = 0; i < results.size(); ++i) {
            const auto& [b, s] = results[i];
            std::printf("%s{\"id\":\"%s\",\"name\":\"%s\",\"dps\":%.1f,\"ci95\":%.1f,\"p5\":%.1f,\"median\":%.1f,"
                        "\"p95\":%.1f,\"single_target_dps\":%.1f,\"kills_per_minute\":%.2f,\"share\":{",
                        i ? "," : "", jsonEscape(b.id).c_str(), jsonEscape(b.name).c_str(), s.meanDps, s.ci95, s.p5,
                        s.median, s.p95, s.singleTargetDps, s.killsPerMinute);
            for (int k = 0; k < SrcCount; ++k)
                std::printf("%s\"%s\":%.4f", k ? "," : "", kSourceNames[k], s.shareBySource[k]);
            std::printf("}}");
        }
        std::printf("]}\n");
        return 0;
    }

    std::printf("Yunara ARAM Mayhem DPS: level %d, %d trials per build, target %g HP / %g armor / %g MR\n\n",
                sc.level, sc.trials, sc.targetHp, sc.targetArmor, sc.targetMr);
    std::printf("%-22s %8s %7s %15s %8s %10s\n", "Build", "DPS", "+/-95%", "5th-95th pct", "1-target", "Kills/min");
    for (const auto& [b, s] : results)
        std::printf("%-22s %8.0f %7.0f %7.0f-%-7.0f %8.0f %10.2f\n", b.name.c_str(), s.meanDps, s.ci95, s.p5, s.p95,
                    s.singleTargetDps, s.killsPerMinute);
    std::printf("\nWhere the damage comes from:\n%-22s", "");
    const char* shortNames[SrcCount] = {"Attack", "Passive", "Q hit", "Q sprd", "W", "Items", "Bolts"};
    for (const char* n : shortNames) std::printf(" %7s", n);
    std::printf("\n");
    for (const auto& [b, s] : results) {
        std::printf("%-22s", b.name.c_str());
        for (double x : s.shareBySource) std::printf(" %6.1f%%", x * 100.0);
        std::printf("\n");
    }
    std::printf("\nValues marked \"approx\" in the data file are estimates; see simulator/README.md.\n");
    return 0;
}
