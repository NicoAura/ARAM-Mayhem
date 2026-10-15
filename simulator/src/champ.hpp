// All-champion ARAM Mayhem simulator: a generic champion model built from
// parsed game data (data/champions.json), shared items and augments, and a
// build optimizer. Same fight scenario, enemy pool and RNG as the Yunara sim.
#pragma once

#include <array>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include "json.hpp"
#include "sim.hpp"

namespace mayhem {

using yunara::EnemyProfile;
using yunara::Scenario;

// Flat numeric properties: stats and effect parameters by name.
using Bag = std::map<std::string, double>;
double get(const Bag& b, const std::string& key, double fallback = 0.0);

enum class DamageType { Physical, Magic, True };
enum class HitTarget { Flat, MaxHp, CurrentHp, MissingHp };
enum class Area { Single, Line, Aoe };

struct Hit {
    DamageType type = DamageType::Magic;
    HitTarget target = HitTarget::Flat;
    bool perSecond = false;
    double weight = 1.0;  // how much of this tooltip number counts per cast
    std::string calc;
    Bag scaling;          // const, ap, bonus_ad, bonus_hp, bonus_armor, bonus_mr, as, crit, lethality
};

struct Ability {
    char slot = 'Q';
    std::string name;
    double cooldown = 10, castTime = 0.25, duration = 0;
    Area area = Area::Single;
    double hitChance = 1.0;
    bool aura = false;  // per-second damage on a toggle or very short cooldown: always on
    int onhitEvery = 0; // > 0: a passive that procs on every Nth attack instead of a cast
    std::vector<Hit> hits;
};

struct ChampionKit {
    std::string id, name, role, parseQuality;
    int championId = 0;
    bool ranged = false;
    double hp = 600, hpG = 100, armor = 30, armorG = 4.5, mr = 32, mrG = 2;
    double ad = 60, adG = 3.5, as = 0.65, asG = 0.02, asRatio = 0.65;
    double damageDealt = 1, damageTaken = 1, mayhemAh = 0, mayhemAs = 0;
    bool hasCn = false;
    double cnDamageShare = 0.2, cnTakenShare = 0.2, cnWeight = 0, cnWinRate = 0.5;
    double attackRange = 125;
    double apRatios = 0, adRatios = 0;  // summed ability scalings, to tell AP from AD kits
    std::vector<Ability> abilities;
};

struct Effect {
    std::string key, name, slot, rarity, confidence;
    int id = 0;
    double cost = 0;
    std::vector<std::string> roles;
    Bag stats, effects;
};

struct Rules {
    double critMult = 2.0, critOverflowAd = 0.45, asCap = 5.0;
    double extraHitWeight = 0.5, skillshotHit = 0.8, aoeSecondaryHit = 0.6, lineSecondaryHit = 0.3;
    double castMin = 0.15, castMax = 0.6, minCooldown = 0.75, dotDuration = 3.0, spellbladeWindow = 10.0;
    // Share of the time a champion can actually attack (in range, target reachable),
    // by attack range. Abilities aren't affected.
    double uptimeMelee = 0.6, uptimeShort = 0.7, uptimeLong = 0.8;
};

struct OptimizerSettings {
    int legendarySlots = 5, augmentSlots = 4, candidates = 14;
    int screenTrials = 64, finalTrials = 2000, finalists = 12;
    // Only search items that fit the champion's class and scalings (no AD-crit Lux).
    bool fittingItemsOnly = true;
};

struct Build {
    std::vector<std::string> items, augments;
};

// Item roles (items.json "roles") worth searching for this champion.
std::vector<std::string> fittingRoles(const ChampionKit& c);

struct Library {
    std::vector<ChampionKit> champions;
    std::map<std::string, Effect> items, augments;
    Rules rules;
    Scenario scenario;
    OptimizerSettings optimizer;
    std::map<int, double> mayhemDamageTaken;  // champion id -> Mayhem damage-taken modifier

    // Settings a user can change (the viewer's controls, or --set key=value), by name:
    // model rules, which shape every champion's kit, and fight settings, applied on top
    // of the enemy pool in scenarioFor. settingKeys() lists them with descriptions.
    using Settings = std::map<std::string, double>;
    Settings fight;                    // fight settings in effect
    std::vector<std::string> enemyTeam;  // when set, every fight is against exactly these champions
    static const std::vector<std::pair<std::string, std::string>>& settingKeys();

    // rulesPath: data/mayhem_rules.json; the other files are found next to it.
    // Unknown setting names throw.
    static Library load(const std::string& rulesPath, const Settings& settings = {});
    const ChampionKit* find(const std::string& nameOrId) const;
    // The fight scenario for one champion: enemy pool without that champion and its
    // real share of team damage taken.
    Scenario scenarioFor(const ChampionKit& c) const;
    void validate(const Build& b) const;

    json::Value enemyPool;
};

enum Source : int { SrcAttack = 0, SrcQ, SrcW, SrcE, SrcR, SrcItems, SrcCount };
extern const char* const kSourceNames[SrcCount];

struct Result {
    double duration = 0, totalDamage = 0, primaryDamage = 0, timeAlive = 0;
    int kills = 0;
    bool died = false;
    std::array<double, SrcCount> bySource{};
};

// One moment of a traced fight, for the animated replay. kind is one of:
// cc, spawn, focus, cast, attack, proc, damage, kill, self, death, end.
struct TraceEvent {
    double t = 0;
    std::string kind;
    int target = -1;          // enemy uid (spawn, focus, damage, kill)
    char slot = 0;            // Q/W/E/R for cast and proc
    std::string text;         // enemy champion id (spawn), damage type (damage), area (cast)
    int source = -1;          // Source of a damage event
    double amount = 0;        // damage dealt; cast time for casts; cc end time for cc
    double hp = 0, maxHp = 0; // enemy HP after the event, or the champion's own HP for self/death
    bool flag = false;        // crit for attacks, the main target was hit for casts
};

struct FightTrace {
    Result result;
    double engageAt = 0, maxHp = 0;
    std::vector<std::string> team;  // enemy champion ids in this fight
    std::vector<TraceEvent> events;
};

// Plays one fight (same draws as runTrials for that trial) and records every event.
FightTrace traceFight(const Library& lib, const ChampionKit& champ, const Build& build, const Scenario& sc,
                      uint64_t trial);

std::vector<Result> runTrials(const Library& lib, const ChampionKit& champ, const Build& build, const Scenario& sc,
                              uint64_t firstTrial, int count);

struct Summary {
    int trials = 0;
    double meanDps = 0, ci95 = 0, p5 = 0, median = 0, p95 = 0;
    double singleTargetDps = 0, killsPerMinute = 0, survivalRate = 0, meanTimeAlive = 0;
    std::array<double, SrcCount> shareBySource{};
};
Summary summarize(const std::vector<Result>& results);

struct Ranked {
    Build build;
    Summary summary;
};

// Searches item builds (boots + legendarySlots legendaries) and then augments for
// the highest mean DPS over the whole fight (dying early counts against a build).
// Uses the same fights for every build (common random numbers) so small
// differences are real differences, not noise. threads > 1 splits the work.
std::vector<Ranked> optimize(const Library& lib, const ChampionKit& champ, const Scenario& sc, int threads,
                             int top = 5);

}  // namespace mayhem
