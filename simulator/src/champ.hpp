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

// Where an ability reaches and what it covers on the ground, in game units
// (data/champions.json "geometry", read from the game's aiming indicators).
enum class Shape { Single, Line, Circle, Cone };
enum class Move { None, Dash, Blink };
struct Geometry {
    Shape shape = Shape::Single;
    double range = 0;      // how far from the caster it can be aimed (0 with onSelf: centred on the caster)
    double radius = 0;     // circle radius
    double width = 0;      // line width
    double angle = 0;      // cone angle, degrees
    double speed = 0;      // missile speed; 0 lands at once
    bool onSelf = false;   // centred on the caster
    bool selfBuff = false; // no area of its own: its damage lands through the champion's attacks
    bool stops = false;    // a line that stops at the first champion it hits
    Move move = Move::None;
};

struct Ability {
    char slot = 'Q';
    std::string name;
    double cooldown = 10, castTime = 0.25, duration = 0;
    double lock = 0;            // seconds a channel keeps the caster busy after it fires
    double castFromAttack = 0;  // > 0: the cast time is this share of the attack wind-up
    bool attackReset = false;   // the next attack can start as soon as it's cast
    Area area = Area::Single;
    Geometry geo;
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
    double attackRange = 125, moveSpeed = 335;
    // Share of an attack's time spent winding up before it fires, and how much of an
    // attack speed gain also speeds up the wind-up (1: all of it).
    double windup = 0.3, windupMod = 1.0;
    double reach = 0;  // how far its damage reaches: attack range, or its abilities' typical range
    double apRatios = 0, adRatios = 0;  // summed ability scalings, to tell AP from AD kits
    std::string combo;  // recommended cast order, e.g. "EQRW" (data/combos.json); empty = by damage
    // Cheating death once a fight (Karthus, Sion, Zilean R, Anivia's egg...): keep acting for
    // deathAct seconds before dying, or go down for reviveDelay seconds and come back with
    // reviveFrac of max Health. deathNeedsR: only while the ultimate is ready (it's used up).
    double deathAct = 0, reviveFrac = 0, reviveDelay = 0, deathChance = 1;
    bool deathNeedsR = false;
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
    double extraHitWeight = 0.5;
    double castMin = 0.0, castMax = 1.5, minCooldown = 0.75, dotDuration = 3.0, spellbladeWindow = 10.0;
    // Positions: whether a skillshot lands comes from where everyone stands and moves.
    double dodgeChance = 0.5;   // chance an enemy sees a skillshot coming and sidesteps
    double reactionTime = 0.25; // seconds before a dodging enemy starts moving
    double aimLead = 0.5;       // how far ahead of a moving target skillshots are aimed (0-1)
    double hitbox = 65;         // champion radius, game units
    double laneHalfWidth = 550; // the Howling Abyss lane, game units from its middle
    // Enemies only hurt you while in reach, so their damage while in reach is scaled
    // up to keep a fight's total about where real games put it.
    double inRangeBoost = 1.0;
    double comboOrder = 1;  // 1: cast in each champion's recommended combo order; 0: by damage
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
    // gameDir: where champions.json, items.json and augments.json are (default: next to the rules,
    // the live patch; data/pbe for the PBE patch).
    static Library load(const std::string& rulesPath, const Settings& settings = {}, const std::string& gameDir = "");
    const ChampionKit* find(const std::string& nameOrId) const;
    // Sets a champion's cast order, e.g. "EQRW" (Q, W, E and R, each at most once). Throws if invalid.
    static void setCombo(ChampionKit& c, const std::string& combo);
    // The fight scenario for one champion: enemy pool without that champion and its
    // real share of team damage taken.
    Scenario scenarioFor(const ChampionKit& c) const;
    void validate(const Build& b) const;

    json::Value enemyPool;
};

enum Source : int { SrcAttack = 0, SrcQ, SrcW, SrcE, SrcR, SrcItems, SrcCount };
extern const char* const kSourceNames[SrcCount];

struct Result {
    double duration = 0, totalDamage = 0, primaryDamage = 0, timeAlive = 0, damageTaken = 0;
    double exposure = 0;  // share of the enemies' damage that could reach you, averaged over the fight
    int kills = 0;
    bool died = false;
    std::array<double, SrcCount> bySource{};
};

// One moment of a traced fight, for the animated replay. kind is one of:
// cc, spawn, focus, cast, attack, proc, damage, kill, self, death, end, pos.
struct TraceEvent {
    double t = 0;
    std::string kind;
    int target = -1;          // enemy uid (spawn, focus, damage, kill)
    char slot = 0;            // Q/W/E/R for cast and proc
    std::string text;         // enemy champion id (spawn), damage type (damage), area (cast)
    int source = -1;          // Source of a damage event
    double amount = 0;        // damage dealt; cast time for casts; wind-up for attacks; cc end time for cc
    double lock = 0;          // casts: seconds a channel keeps the caster busy after it fires
    double hp = 0, maxHp = 0; // enemy HP after the event, or the champion's own HP for self/death
    bool flag = false;        // crit for attacks, the main target was hit for casts
    double x = 0, y = 0;      // casts: where it was aimed
    double flight = 0;        // casts: seconds the missile flies
    std::vector<double> pos;  // pos: uid, x, y for everyone standing (uid -1 is the champion)
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
    double damageTakenPerSec = 0;  // damage you take per second alive, after your resists
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
