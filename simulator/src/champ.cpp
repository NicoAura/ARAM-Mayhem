#include "champ.hpp"

#include <algorithm>
#include <cmath>
#include <cctype>
#include <fstream>
#include <numeric>
#include <set>
#include <sstream>
#include <stdexcept>
#ifndef __EMSCRIPTEN__
#include <thread>
#include <type_traits>
#endif

#include "rng.hpp"

namespace mayhem {

const char* const kSourceNames[SrcCount] = {"Basic attacks", "Q", "W", "E", "R", "Items and augments"};

double get(const Bag& b, const std::string& key, double fallback) {
    auto it = b.find(key);
    return it == b.end() ? fallback : it->second;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

namespace {

std::string readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) throw std::runtime_error("cannot open " + path);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

std::string dirOf(const std::string& path) {
    const auto slash = path.find_last_of("/\\");
    return slash == std::string::npos ? std::string(".") : path.substr(0, slash);
}

std::string lower(std::string s) {
    for (auto& ch : s) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    std::string out;
    for (char ch : s)
        if (std::isalnum(static_cast<unsigned char>(ch))) out += ch;
    return out;
}

Bag bagOf(const json::Value& v) {
    Bag b;
    for (const auto& [k, x] : v.obj)
        if (x.isNumber()) b[k] = x.asNumber();
    return b;
}

double ruleValue(const json::Value& rules, const char* key, double fallback) {
    const json::Value& r = rules[key];
    if (r.isObject()) return r["value"].asNumber(fallback);
    return r.asNumber(fallback);
}

std::map<std::string, Effect> loadEffects(const json::Value& obj, const char* defaultSlot) {
    std::map<std::string, Effect> out;
    for (const auto& [key, v] : obj.obj) {
        if (!v.isObject()) continue;
        Effect e;
        e.key = key;
        e.name = v["name"].asString(key);
        e.id = static_cast<int>(v["id"].asNumber(0));
        e.slot = v["slot"].asString(defaultSlot);
        e.rarity = v["rarity"].asString();
        e.cost = v["cost"].asNumber(0);
        e.confidence = v["confidence"].asString("approx");
        for (const auto& r : v["roles"].arr) e.roles.push_back(r.asString());
        e.stats = bagOf(v["stats"]);
        e.effects = bagOf(v["effects"]);
        out[key] = e;
    }
    return out;
}

Area areaOf(const std::string& s) {
    if (s == "aoe") return Area::Aoe;
    if (s == "line") return Area::Line;
    return Area::Single;
}

Geometry geometryOf(const json::Value& g, Area area, double attackRange) {
    Geometry geo;
    const std::string shape = g["shape"].asString();
    geo.shape = shape == "line" ? Shape::Line : shape == "circle" ? Shape::Circle : shape == "cone" ? Shape::Cone
                : shape == "single"                                                     ? Shape::Single
                : area == Area::Line ? Shape::Line : area == Area::Aoe ? Shape::Circle : Shape::Single;
    geo.range = g["range"].asNumber(0);
    geo.radius = g["radius"].asNumber(geo.shape == Shape::Circle ? 250 : 0);
    geo.width = g["width"].asNumber(geo.shape == Shape::Line ? 80 : 0);
    geo.angle = g["angle"].asNumber(geo.shape == Shape::Cone ? 45 : 0);
    geo.speed = g["speed"].asNumber(0);
    geo.onSelf = g["on_self"].asBool(false);
    geo.selfBuff = g["self_buff"].asBool(false);
    geo.stops = g["stops"].asBool(false);
    const std::string move = g["move"].asString();
    geo.move = move == "dash" ? Move::Dash : move == "blink" ? Move::Blink : Move::None;
    if (geo.range <= 0 && !geo.onSelf) geo.range = std::max(600.0, attackRange + 100);
    if (geo.selfBuff) geo.range = attackRange;
    return geo;
}

ChampionKit loadChampion(const json::Value& c, const Rules& rules) {
    ChampionKit k;
    k.id = c["id"].asString();
    k.name = c["name"].asString(k.id);
    k.championId = static_cast<int>(c["champion_id"].asNumber(0));
    k.role = c["role"].asString("fighter");
    k.ranged = c["ranged"].asBool(false);
    k.parseQuality = c["parse_quality"].asString();
    const json::Value& s = c["stats"];
    k.hp = s["hp"].asNumber(k.hp);
    k.hpG = s["hp_per_level"].asNumber(k.hpG);
    k.armor = s["armor"].asNumber(k.armor);
    k.armorG = s["armor_per_level"].asNumber(k.armorG);
    k.mr = s["mr"].asNumber(k.mr);
    k.mrG = s["mr_per_level"].asNumber(k.mrG);
    k.ad = s["ad"].asNumber(k.ad);
    k.adG = s["ad_per_level"].asNumber(k.adG);
    k.as = s["attack_speed"].asNumber(k.as);
    k.asG = s["attack_speed_per_level"].asNumber(k.asG);
    k.asRatio = s["attack_speed_ratio"].asNumber(k.as);
    k.attackRange = s["attack_range"].asNumber(k.ranged ? 550 : 125);
    k.moveSpeed = s["move_speed"].asNumber(k.moveSpeed);
    const json::Value& m = c["mayhem"];
    k.damageDealt = m["damage_dealt"].asNumber(1.0);
    k.damageTaken = m["damage_taken"].asNumber(1.0);
    k.mayhemAh = m["ability_haste"].asNumber(0.0);
    k.mayhemAs = m["attack_speed"].asNumber(0.0);
    const json::Value& cn = c["cn"];
    if (cn.isObject()) {
        k.hasCn = true;
        k.cnDamageShare = cn["damage_share"].asNumber(0.2);
        k.cnTakenShare = cn["damage_taken_share"].asNumber(0.2);
        k.cnWeight = cn["weight"].asNumber(0.0);
        k.cnWinRate = cn["win_rate"].asNumber(0.5);
    }
    for (const auto& a : c["abilities"].arr) {
        Ability ab;
        const std::string slot = a["slot"].asString("Q");
        ab.slot = slot.empty() ? 'Q' : slot[0];
        ab.name = a["name"].asString();
        ab.cooldown = a["cooldown"].asNumber(10);
        ab.castTime = std::clamp(a["cast_time"].asNumber(0.25), rules.castMin, rules.castMax);
        ab.duration = a["duration"].asNumber(0);
        ab.area = areaOf(a["area"].asString());
        ab.geo = geometryOf(a["geometry"], ab.area, k.attackRange);
        ab.onhitEvery = static_cast<int>(a["onhit_every"].asNumber(0));

        // Which tooltip numbers count: the first main number fully, repeats of the
        // same formula fully (e.g. Ahri Q out and back), other numbers at
        // extraHitWeight. Alternatives (empowered/maximum versions) only when an
        // ability has nothing else.
        std::vector<Hit> main, alts;
        for (const auto& h : a["hits"].arr) {
            Hit hit;
            const std::string type = h["type"].asString("magic");
            hit.type = type == "physical" ? DamageType::Physical : type == "true" ? DamageType::True : DamageType::Magic;
            const std::string target = h["target"].asString("flat");
            hit.target = target == "target_max_hp"       ? HitTarget::MaxHp
                         : target == "target_current_hp" ? HitTarget::CurrentHp
                         : target == "target_missing_hp" ? HitTarget::MissingHp
                                                         : HitTarget::Flat;
            hit.perSecond = h["per_second"].asBool(false);
            hit.calc = h["calc"].asString();
            hit.scaling = bagOf(h["scaling"]);
            (h["alt"].asBool(false) ? alts : main).push_back(hit);
        }
        if (main.empty() && !alts.empty()) main.push_back(alts.front());
        std::set<std::string> seen;
        bool first = true;
        for (auto& hit : main) {
            if (first || seen.count(hit.calc)) hit.weight = 1.0;
            else hit.weight = hit.target == HitTarget::Flat ? rules.extraHitWeight : 1.0;
            // A percent-health part usually belongs to the main hit, so it counts fully.
            first = false;
            seen.insert(hit.calc);
            ab.hits.push_back(hit);
        }
        bool allPerSecond = !ab.hits.empty();
        for (const auto& hit : ab.hits) allPerSecond &= hit.perSecond;
        ab.aura = allPerSecond && ab.cooldown < 1.0 && ab.onhitEvery == 0;
        if (!ab.aura && ab.onhitEvery == 0) ab.cooldown = std::max(ab.cooldown, rules.minCooldown);
        for (const auto& hit : ab.hits) {
            k.apRatios += get(hit.scaling, "ap") * hit.weight;
            k.adRatios += get(hit.scaling, "bonus_ad") * hit.weight;
        }
        if (!ab.hits.empty()) k.abilities.push_back(ab);
    }
    // How far its damage reaches, as an enemy: the middle of its basic abilities' reach
    // (capped at 800), or its attack range. Ultimates and dashes don't count: a dash
    // brings it close, and long-range ultimates aren't what it fights with.
    std::vector<double> reaches;
    for (const auto& a : k.abilities) {
        if (a.onhitEvery > 0 || a.slot == 'R' || a.geo.move != Move::None) continue;
        const Geometry& g = a.geo;
        double r = g.shape == Shape::Circle ? (g.onSelf ? g.radius : g.range + 0.5 * g.radius) : g.range;
        reaches.push_back(std::clamp(r, k.attackRange, 800.0));
    }
    std::sort(reaches.begin(), reaches.end());
    k.reach = reaches.empty() ? k.attackRange : std::max(k.attackRange, reaches[reaches.size() / 2]);
    return k;
}

}  // namespace

const std::vector<std::pair<std::string, std::string>>& Library::settingKeys() {
    static const std::vector<std::pair<std::string, std::string>> keys = {
        // fight
        {"level", "champion level (1-18)"},
        {"fight_mean", "average fight length, seconds"},
        {"fight_sd", "spread of fight length, seconds"},
        {"fight_min", "shortest fight, seconds"},
        {"fight_max", "longest fight, seconds"},
        {"engage_min", "earliest time enemies start hitting you, seconds"},
        {"engage_max", "latest time enemies start hitting you, seconds"},
        {"enemy_damage_scale", "multiplies the damage enemies deal to you"},
        {"cc_scale", "multiplies how often you get crowd controlled"},
        {"cc_min", "shortest crowd control, seconds"},
        {"cc_max", "longest crowd control, seconds"},
        {"start_distance", "how far away the enemy team starts, game units"},
        {"enemy_spread", "how spread out the enemy team stands, game units"},
        {"r_ready_chance", "chance your ultimate is up when the fight starts"},
        {"retarget_delay", "seconds to reach the next target after a kill"},
        {"fixed_target", "1: fight dummies with the HP and resists below instead of real champions"},
        {"target_hp", "dummy HP"},
        {"target_armor", "dummy armor"},
        {"target_mr", "dummy magic resist"},
        // model rules
        {"dodge_chance", "chance an enemy sees a skillshot coming and sidesteps"},
        {"reaction_time", "seconds before a dodging enemy starts moving"},
        {"aim_lead", "how far ahead of a moving enemy skillshots are aimed (0-1)"},
        {"combo_order", "1: cast abilities in each champion's recommended combo order; 0: strongest first"},
    };
    return keys;
}

static bool isModelKey(const std::string& k) {
    return k == "dodge_chance" || k == "reaction_time" || k == "aim_lead" || k == "combo_order";
}

Library Library::load(const std::string& rulesPath, const Settings& settings) {
    Library lib;
    for (const auto& [k, v] : settings) {
        bool known = false;
        for (const auto& kv : settingKeys()) known |= kv.first == k;
        if (!known) throw std::runtime_error("unknown setting '" + k + "'");
        if (!isModelKey(k)) lib.fight[k] = v;
    }
    const std::string dir = dirOf(rulesPath);
    const json::Value root = json::parse(readFile(rulesPath));
    const json::Value& r = root["rules"];
    lib.rules.critMult = ruleValue(r, "base_crit_multiplier", 2.0);
    lib.rules.critOverflowAd = ruleValue(r, "crit_overflow_ad_per_percent", 0.45);
    lib.rules.asCap = ruleValue(r, "attack_speed_cap", 5.0);
    const json::Value& m = root["model"];
    lib.rules.extraHitWeight = m["extra_hit_weight"].asNumber(lib.rules.extraHitWeight);
    lib.rules.dodgeChance = m["dodge_chance"].asNumber(lib.rules.dodgeChance);
    lib.rules.reactionTime = m["reaction_time"].asNumber(lib.rules.reactionTime);
    lib.rules.aimLead = m["aim_lead"].asNumber(lib.rules.aimLead);
    lib.rules.hitbox = m["hitbox_radius"].asNumber(lib.rules.hitbox);
    lib.rules.laneHalfWidth = m["lane_half_width"].asNumber(lib.rules.laneHalfWidth);
    lib.rules.inRangeBoost = m["in_range_damage_boost"].asNumber(lib.rules.inRangeBoost);
    lib.rules.castMin = m["cast_time_min"].asNumber(lib.rules.castMin);
    lib.rules.castMax = m["cast_time_max"].asNumber(lib.rules.castMax);
    lib.rules.minCooldown = m["min_cooldown"].asNumber(lib.rules.minCooldown);
    lib.rules.dotDuration = m["default_dot_duration"].asNumber(lib.rules.dotDuration);
    lib.rules.spellbladeWindow = m["spellblade_window"].asNumber(lib.rules.spellbladeWindow);
    auto setRule = [&](const char* key, double& field) {
        auto it = settings.find(key);
        if (it != settings.end()) field = std::clamp(it->second, 0.0, 1.0);
    };
    setRule("dodge_chance", lib.rules.dodgeChance);
    setRule("reaction_time", lib.rules.reactionTime);
    setRule("aim_lead", lib.rules.aimLead);
    setRule("combo_order", lib.rules.comboOrder);
    const json::Value& o = root["optimizer"];
    OptimizerSettings& os = lib.optimizer;
    os.legendarySlots = static_cast<int>(o["legendary_slots"].asNumber(os.legendarySlots));
    os.augmentSlots = static_cast<int>(o["augment_slots"].asNumber(os.augmentSlots));
    os.candidates = static_cast<int>(o["candidate_items"].asNumber(os.candidates));
    os.screenTrials = static_cast<int>(o["screen_trials"].asNumber(os.screenTrials));
    os.finalTrials = static_cast<int>(o["final_trials"].asNumber(os.finalTrials));
    os.finalists = static_cast<int>(o["finalists"].asNumber(os.finalists));
    os.fittingItemsOnly = o["fitting_items_only"].asBool(os.fittingItemsOnly);

    lib.scenario = Scenario::fromJson(root["scenario"]);
    const json::Value champs = json::parse(readFile(dir + "/champions.json"));
    for (const auto& c : champs["champions"].arr) {
        lib.champions.push_back(loadChampion(c, lib.rules));
        lib.mayhemDamageTaken[lib.champions.back().championId] = lib.champions.back().damageTaken;
    }
    // Recommended combos: the order each champion casts abilities in when several are ready.
    std::ifstream comboFile(dir + "/combos.json");
    if (comboFile) {
        const json::Value combos = json::parse(readFile(dir + "/combos.json"));
        for (auto& c : lib.champions) {
            const std::string combo = combos[c.id].asString();
            if (!combo.empty()) Library::setCombo(c, combo);
        }
    }
    lib.items = loadEffects(json::parse(readFile(dir + "/items.json"))["items"], "legendary");
    lib.augments = loadEffects(json::parse(readFile(dir + "/augments.json"))["augments"], "augment");
    const std::string pool = root["scenario"]["enemy_pool"].asString();
    if (!pool.empty()) lib.enemyPool = json::parse(readFile(dir + "/" + pool));
    return lib;
}

void Library::setCombo(ChampionKit& c, const std::string& combo) {
    std::string out;
    for (char ch : combo) {
        const char up = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
        if (up == ' ' || up == '>' || up == '-' || up == ',') continue;
        if (std::string("QWER").find(up) == std::string::npos || out.find(up) != std::string::npos)
            throw std::runtime_error("combo '" + combo + "' for " + c.name + ": use each of Q, W, E, R at most once");
        out += up;
    }
    c.combo = out;
}

const ChampionKit* Library::find(const std::string& nameOrId) const {
    const std::string want = lower(nameOrId);
    for (const auto& c : champions)
        if (lower(c.id) == want || lower(c.name) == want || std::to_string(c.championId) == nameOrId) return &c;
    return nullptr;
}

double meanExposure(const Library& lib, const ChampionKit& c, const Scenario& sc);

Scenario Library::scenarioFor(const ChampionKit& c) const {
    Scenario sc = scenario;
    if (enemyPool.isObject()) {
        sc.applyEnemyPool(enemyPool, c.championId);
        for (auto& e : sc.enemies) {
            auto it = mayhemDamageTaken.find(e.championId);
            if (it != mayhemDamageTaken.end()) e.damageTaken = it->second;
            if (const ChampionKit* k = find(std::to_string(e.championId))) {
                e.moveSpeed = k->moveSpeed;
                e.reach = k->reach;
            }
        }
    }
    sc.damageTakenFactor = c.damageTaken;

    if (!enemyTeam.empty() && enemyPool.isObject()) {
        std::vector<EnemyProfile> picked;
        for (const auto& entry : enemyTeam) {
            // "Malphite" or "Malphite:hp=5000:armor=250" to change that enemy's stats.
            std::vector<std::string> parts;
            std::stringstream ss(entry);
            for (std::string part; std::getline(ss, part, ':');) parts.push_back(part);
            const std::string want = parts.empty() ? entry : parts[0];
            bool found = false;
            for (const auto& e : sc.enemies)
                if (lower(e.id) == lower(want) || lower(e.name) == lower(want)) {
                    picked.push_back(e);
                    found = true;
                    break;
                }
            if (!found) throw std::runtime_error("'" + want + "' is not in the enemy pool (or is the champion itself)");
            EnemyProfile& p = picked.back();
            p.weight = 1.0;
            for (size_t i = 1; i < parts.size(); ++i) {
                const auto eq = parts[i].find('=');
                if (eq == std::string::npos) throw std::runtime_error("enemy stat '" + parts[i] + "' needs key=value");
                const std::string key = parts[i].substr(0, eq);
                const double v = std::stod(parts[i].substr(eq + 1));
                if (key == "hp") p.hp = std::max(1.0, v);
                else if (key == "armor") p.armor = std::max(0.0, v);
                else if (key == "mr") p.mr = std::max(0.0, v);
                else if (key == "damage_share") p.damageShare = std::max(0.0, v);
                else if (key == "phys_share") p.physShare = std::clamp(v, 0.0, 1.0);
                else if (key == "cc") p.cc = std::max(0.0, v);
                else if (key == "damage_taken") p.damageTaken = std::max(0.0, v);
                else throw std::runtime_error("unknown enemy stat '" + key +
                                              "' (use hp, armor, mr, damage_share, phys_share, cc, damage_taken)");
            }
        }
        sc.enemies = picked;
        sc.teamSize = static_cast<int>(picked.size());
    }
    auto set = [&](const char* key, auto& field) {
        auto it = fight.find(key);
        if (it != fight.end()) field = static_cast<std::decay_t<decltype(field)>>(it->second);
    };
    set("level", sc.level);
    sc.level = std::clamp(sc.level, 1, 18);
    set("fight_mean", sc.fightMean);
    set("fight_sd", sc.fightSd);
    set("fight_min", sc.fightMin);
    set("fight_max", sc.fightMax);
    sc.fightMax = std::max(sc.fightMax, sc.fightMin + 0.5);
    set("engage_min", sc.engageMin);
    set("engage_max", sc.engageMax);
    sc.engageMax = std::max(sc.engageMax, sc.engageMin);
    set("cc_min", sc.ccMin);
    set("cc_max", sc.ccMax);
    sc.ccMax = std::max(sc.ccMax, sc.ccMin);
    set("start_distance", sc.startDistance);
    set("enemy_spread", sc.enemySpread);
    set("r_ready_chance", sc.rReadyChance);
    set("retarget_delay", sc.retargetDelay);
    if (auto it = fight.find("enemy_damage_scale"); it != fight.end()) sc.damageTakenFactor *= std::max(0.0, it->second);
    if (auto it = fight.find("cc_scale"); it != fight.end()) {
        const double k = std::max(0.0, it->second);
        sc.ccRatePerPoint *= k; sc.ccRateMin *= k; sc.ccRateMax *= k;
    }
    if (auto it = fight.find("fixed_target"); it != fight.end() && it->second > 0) {
        sc.fixedTarget = true;
        sc.enemies.clear();
        sc.teamDrivenDamage = false;
        set("target_hp", sc.targetHp);
        set("target_armor", sc.targetArmor);
        set("target_mr", sc.targetMr);
    }
    // Enemies only hurt you while you're within their reach, but the simulation has no
    // teammates for them to hit instead, so how much damage you take overall still
    // follows real games (this champion's share of its team's damage taken). Where you
    // stand decides when it lands and from whom: the damage while in reach is scaled by
    // how much of the enemies' damage reaches this champion in a typical fight.
    const double share = c.hasCn ? c.cnTakenShare / 0.2 : 1.0;
    const double exposure = meanExposure(*this, c, sc);
    sc.damageTakenFactor *= share / std::max(0.15, exposure);
    return sc;
}

void Library::validate(const Build& b) const {
    for (const auto& i : b.items)
        if (!items.count(i)) throw std::runtime_error("unknown item '" + i + "'");
    for (const auto& a : b.augments)
        if (!augments.count(a)) throw std::runtime_error("unknown augment '" + a + "'");
}

// ---------------------------------------------------------------------------
// One teamfight
// ---------------------------------------------------------------------------

namespace {

using mcrng::Rng;

struct Vec {
    double x = 0, y = 0;
};
inline Vec operator+(Vec a, Vec b) { return {a.x + b.x, a.y + b.y}; }
inline Vec operator-(Vec a, Vec b) { return {a.x - b.x, a.y - b.y}; }
inline Vec operator*(Vec a, double k) { return {a.x * k, a.y * k}; }
inline double dot(Vec a, Vec b) { return a.x * b.x + a.y * b.y; }
inline double cross(Vec a, Vec b) { return a.x * b.y - a.y * b.x; }
inline double len(Vec a) { return std::sqrt(dot(a, a)); }
inline Vec unit(Vec a, Vec fallback = {1, 0}) {
    const double l = len(a);
    return l > 1e-9 ? a * (1.0 / l) : fallback;
}

struct Enemy {
    double hp = 0, maxHp = 0;
    double physMult = 1, magicMult = 1, trueMult = 1;
    bool alive = true;
    double respawnAt = 0, burnUntil = -1, conduitAt = -1;
    int uid = -1;
    // where it stands and how it moves
    const EnemyProfile* profile = nullptr;
    Vec pos, vel, home;
    double moveSpeed = 340, reach = 550, damageWeight = 0.2;
    double strafe = 0, strafeUntil = 0, dodgeUntil = -1;
    Vec dodgeVel;
};

// An item or augment effect with its own cooldown or counter.
struct Proc {
    const Bag* fx = nullptr;
    double readyAt = 0;
    int counter = 0;
};

class Fight {
public:
    Fight(const Library& lib, const ChampionKit& ch, const Build& build, const Scenario& sc, uint64_t trial,
          FightTrace* trace = nullptr)
        : lib_(lib), ch_(ch), sc_(sc), rules_(lib.rules), rng_(sc.seed, trial), trace_(trace) {
        setupScenario();  // draw the fight first so every build sees the same fights
        setupBuild(build);
        setupDefences();
    }

    Result run();

private:
    const Library& lib_;
    const ChampionKit& ch_;
    const Scenario& sc_;
    const Rules& rules_;
    Rng rng_;
    Result res_;
    FightTrace* trace_ = nullptr;  // recording never draws random numbers, so traced fights match untraced ones
    int nextUid_ = 0;
    double lastSelfAt_ = -1;

    void record(TraceEvent e) {
        if (trace_) trace_->events.push_back(std::move(e));
    }
    void recordSelf(double t, const char* kind = "self") {
        if (!trace_ || (t - lastSelfAt_ < 0.1 && kind[0] == 's')) return;
        lastSelfAt_ = t;
        TraceEvent e;
        e.t = t; e.kind = kind; e.hp = myHp_; e.maxHp = maxHp_;
        record(e);
    }
    void recordFocus() {
        if (!trace_ || !hasPrimary()) return;
        TraceEvent e;
        e.t = t_; e.kind = "focus"; e.target = P().uid;
        record(e);
    }

    // build
    Bag fx_;  // summed effects
    double ad_ = 0, bonusAd_ = 0, baseAd_ = 0, ap_ = 0, bonusAs_ = 0, crit_ = 0, critDamage_ = 0;
    double maxHp_ = 0, bonusHp_ = 0, armor_ = 0, bonusArmor_ = 0, mr_ = 0, bonusMr_ = 0, ah_ = 0;
    double lethality_ = 0, armorPen_ = 0, magicPen_ = 0, magicPenPct_ = 0, lifesteal_ = 0, omnivamp_ = 0;
    double damageAmp_ = 1, abilityAmp_ = 1;
    double attackSpeed_ = 0;
    const Bag* spellblade_ = nullptr;
    std::vector<Proc> abilityProcs_, attackProcs_, actives_;
    Proc missile_, kraken_, storm_, eclipse_;
    bool hasMissile_ = false, hasKraken_ = false, hasStorm_ = false, hasEclipse_ = false;

    // fight
    double t_ = 0, duration_ = 0, nextAttack_ = 0, primaryRespawnAt_ = 0, spellbladeReady_ = 0;
    bool spellbladeArmed_ = false;
    double spellbladeArmedAt_ = 0;
    int attacks_ = 0;
    std::vector<double> readyAt_;
    std::vector<size_t> order_;
    std::vector<std::pair<double, double>> cc_;
    std::vector<const EnemyProfile*> team_;
    double totalWeight_ = 0;
    // Everyone on the field. enemies_[primary_] is the current target (-1: none alive).
    std::vector<Enemy> enemies_;
    int primary_ = -1;
    Enemy& P() { return enemies_[static_cast<size_t>(primary_)]; }
    bool hasPrimary() const { return primary_ >= 0 && enemies_[static_cast<size_t>(primary_)].alive; }
    Vec me_;
    double moveSpeed_ = 335, posClock_ = 0, nextPosAt_ = 0, busyUntil_ = 0, wantRange_ = 0;
    Rng moveRng_{1, 2};
    double exposureSum_ = 0, exposureTime_ = 0;
    static constexpr double kStep = 0.05;     // movement and damage-taken step, seconds
    static constexpr double kPosEvery = 0.2;  // replay position snapshots, seconds
    bool rUp_ = false;
    double myHp_ = 0, incomingDps_ = 0, engageAt_ = 0, damageClock_ = 0, auraClock_ = 0, auraDps_ = 0;
    std::vector<std::pair<const Ability*, const Hit*>> auraHits_;
    std::vector<const Ability*> onhitAbilities_;
    bool dead_ = false;

    static double levelScale(int level) {
        const double n = level - 1;
        return n * (0.7025 + 0.0175 * n);
    }

    void addBag(const Bag& src, Bag& dst) {
        for (const auto& [k, v] : src) {
            if (k == "armor_pen" || k == "magic_pen_pct") dst[k] = 1.0 - (1.0 - get(dst, k)) * (1.0 - v);
            else dst[k] += v;
        }
    }

    void setupBuild(const Build& b) {
        Bag stats;
        std::vector<const Effect*> effects;
        for (const auto& id : b.items) effects.push_back(&lib_.items.at(id));
        for (const auto& id : b.augments) effects.push_back(&lib_.augments.at(id));
        double bestBlade = -1;
        for (const Effect* e : effects) {
            addBag(e->stats, stats);
            addBag(e->effects, fx_);
            const Bag& f = e->effects;
            if (get(f, "spellblade_cd") > 0) {  // spellblades don't stack: keep the strongest
                const double power = get(f, "spellblade_base_ad") * 3 + get(f, "spellblade_ap") * 3;
                if (power > bestBlade) { bestBlade = power; spellblade_ = &f; }
            }
            if (get(f, "proc_cd") > 0) abilityProcs_.push_back({&f});
            if (get(f, "active_cd") > 0) actives_.push_back({&f});
            if (get(f, "missile_cd") > 0) { hasMissile_ = true; missile_.fx = &f; }
            if (get(f, "kraken_every") > 0) { hasKraken_ = true; kraken_.fx = &f; }
            if (get(f, "storm_every") > 0) { hasStorm_ = true; storm_.fx = &f; }
            if (get(f, "maxhp_proc_cd") > 0) { hasEclipse_ = true; eclipse_.fx = &f; }
        }
        const double g = levelScale(sc_.level);
        baseAd_ = ch_.ad + ch_.adG * g;
        bonusAd_ = get(stats, "ad");
        ap_ = get(stats, "ap");
        // Adaptive amplifiers boost whichever of AP or bonus AD the build has more of.
        const double adaptive = get(fx_, "adaptive_amp");
        if (ap_ >= bonusAd_) ap_ *= 1.0 + adaptive;
        else bonusAd_ *= 1.0 + adaptive;
        ap_ *= 1.0 + get(fx_, "ap_amp");
        crit_ = get(stats, "crit");
        if (crit_ > 1.0) {  // Mayhem: crit chance above 100% becomes AD
            bonusAd_ += (crit_ - 1.0) * 100.0 * rules_.critOverflowAd;
            crit_ = 1.0;
        }
        critDamage_ = get(stats, "crit_damage");
        ad_ = baseAd_ + bonusAd_;
        bonusAs_ = ch_.asG * g + get(stats, "as");
        attackSpeed_ = std::min(rules_.asCap, (ch_.as + ch_.asRatio * bonusAs_) *
                                                  (1.0 + get(fx_, "total_as_mult") + ch_.mayhemAs));
        bonusHp_ = get(stats, "hp");
        const double baseHp = ch_.hp + ch_.hpG * g;
        maxHp_ = (baseHp + bonusHp_) * (1.0 + get(fx_, "hp_pct"));
        bonusHp_ = maxHp_ - baseHp;
        bonusArmor_ = get(stats, "armor");
        armor_ = ch_.armor + ch_.armorG * g + bonusArmor_;
        bonusMr_ = get(stats, "mr");
        mr_ = ch_.mr + ch_.mrG * g + bonusMr_;
        ah_ = get(stats, "ah") + ch_.mayhemAh + get(fx_, "ah_per_ap") * ap_;
        lethality_ = get(stats, "lethality");
        armorPen_ = get(stats, "armor_pen");
        magicPen_ = get(stats, "magic_pen");
        magicPenPct_ = get(stats, "magic_pen_pct");
        lifesteal_ = get(stats, "lifesteal");
        omnivamp_ = get(stats, "omnivamp");
        damageAmp_ = (1.0 + get(fx_, "damage_amp")) * ch_.damageDealt;
        abilityAmp_ = 1.0 + get(fx_, "ability_amp");
        myHp_ = maxHp_;
        moveSpeed_ = ch_.moveSpeed;
        for (const auto& id : b.items)
            if (lib_.items.at(id).slot == "boots") moveSpeed_ += 45;  // every tier-2 boot gives +45 move speed

        // Ability order: the champion's recommended combo when it has one (and the
        // combo_order setting is on), otherwise R when it's up, then the rest by damage per cast.
        readyAt_.assign(ch_.abilities.size(), 0.0);
        std::vector<std::pair<double, size_t>> byDamage;
        for (size_t i = 0; i < ch_.abilities.size(); ++i) {
            const Ability& a = ch_.abilities[i];
            if (a.aura) {
                for (const auto& h : a.hits) auraHits_.push_back({&a, &h});
                continue;
            }
            if (a.onhitEvery > 0) {
                onhitAbilities_.push_back(&a);
                continue;
            }
            double raw = 0;
            for (const auto& h : a.hits) raw += h.weight * scaled(h.scaling) * (h.target == HitTarget::Flat ? 1 : 3000);
            byDamage.push_back({(a.slot == 'R' ? 1e12 : 0) + raw, i});
            if (a.slot == 'R' && !rUp_) readyAt_[i] = 1e18;
        }
        if (rules_.comboOrder > 0.5 && !ch_.combo.empty())
            for (auto& [d, i] : byDamage) {
                const auto pos = ch_.combo.find(ch_.abilities[i].slot);
                d = (pos == std::string::npos ? 0 : 1e15 * static_cast<double>(4 - pos)) + d * 1e-15;
            }
        std::sort(byDamage.rbegin(), byDamage.rend());
        for (const auto& [d, i] : byDamage) order_.push_back(i);
    }

    double scaled(const Bag& s) const {
        double v = 0;
        for (const auto& [k, c] : s) {
            if (k == "const") v += c;
            else if (k == "ap") v += c * ap_;
            else if (k == "bonus_ad") v += c * bonusAd_;
            else if (k == "bonus_hp") v += c * bonusHp_;
            else if (k == "bonus_armor") v += c * bonusArmor_;
            else if (k == "bonus_mr") v += c * bonusMr_;
            else if (k == "as") v += c * bonusAs_;
            else if (k == "crit") v += c * crit_;
            else if (k == "lethality") v += c * lethality_;
        }
        return v;
    }

    void drawTeam() {
        const auto& pool = sc_.enemies;
        const size_t size = static_cast<size_t>(std::max(1, sc_.teamSize));
        const bool distinct = pool.size() >= size;
        std::vector<bool> taken(pool.size(), false);
        double remaining = totalWeight_;
        for (size_t k = 0; k < size; ++k) {
            double r = rng_.uniform() * remaining;
            size_t pick = pool.size();
            for (size_t i = 0; i < pool.size(); ++i) {
                if (taken[i]) continue;
                if (r < pool[i].weight) { pick = i; break; }
                r -= pool[i].weight;
            }
            if (pick == pool.size())
                for (size_t i = pool.size(); i-- > 0;)
                    if (!taken[i]) { pick = i; break; }
            team_.push_back(&pool[pick]);
            if (distinct) { taken[pick] = true; remaining -= pool[pick].weight; }
        }
    }

    // Draws everything about the fight that doesn't depend on the build.
    void setupScenario() {
        duration_ = std::clamp(rng_.normal(sc_.fightMean, sc_.fightSd), sc_.fightMin, sc_.fightMax);
        for (const auto& e : sc_.enemies) totalWeight_ += e.weight;
        if (!sc_.fixedTarget) drawTeam();
        double ccRate = rng_.uniform(sc_.ccRateMin, sc_.ccRateMax);
        if (sc_.ccRatePerPoint > 0 && !team_.empty()) {
            double points = 0;
            for (const auto* e : team_) points += e->cc;
            ccRate = sc_.ccRatePerPoint * points;
        }
        if (ccRate > 0)
            for (double t = rng_.exponential(ccRate); t < duration_; t += rng_.exponential(ccRate))
                cc_.push_back({t, t + rng_.uniform(sc_.ccMin, sc_.ccMax)});
        rUp_ = rng_.chance(sc_.rReadyChance);
        engageAt_ = rng_.uniform(sc_.engageMin, sc_.engageMax);
        incomingRoll_ = std::max(0.0, rng_.normal(sc_.enemyDpsMean, sc_.enemyDpsSd));
        targetSeed_ = rng_.next();
    }
    double incomingRoll_ = 0;
    uint64_t targetSeed_ = 0;

    void setupDefences() {
        // Enemy spawns and movement use their own streams so builds that kill faster
        // don't shift the rest of the fight's random draws.
        targetRng_ = Rng(targetSeed_, 1);
        moveRng_ = Rng(targetSeed_, 2);
        double physShare = sc_.enemyPhysShare, teamDamage = 1.0, share = 0;
        if (sc_.teamDrivenDamage && !team_.empty()) {
            double phys = 0;
            for (const auto* e : team_) { share += e->damageShare; phys += e->damageShare * e->physShare; }
            if (share > 0) physShare = phys / share;
            teamDamage = share / (0.2 * static_cast<double>(team_.size()));
        }
        const double mitigation = physShare * 100.0 / (100.0 + armor_) + (1.0 - physShare) * 100.0 / (100.0 + mr_);
        incomingDps_ = incomingRoll_ * sc_.damageTakenFactor * teamDamage * mitigation * rules_.inRangeBoost;
        // Always-on damage (Sunfire-style auras and damage toggles).
        auraDps_ = get(fx_, "aura_flat") + get(fx_, "aura_bonus_hp") * bonusHp_;

        // The field: you at the origin, the enemy team further up the lane, its
        // short-range champions in front.
        me_ = {0, 0};
        const size_t n = static_cast<size_t>(std::max(1, sc_.teamSize));
        enemies_.resize(n);
        for (size_t i = 0; i < n; ++i) {
            const EnemyProfile* p = sc_.fixedTarget || team_.empty() ? nullptr : team_[i % team_.size()];
            Enemy& e = enemies_[i];
            e = spawnEnemy(p);
            const double reach = p ? p->reach : 550.0;
            e.home = {sc_.startDistance + 0.5 * (std::min(reach, 650.0) - 400.0) + moveRng_.normal(0, 0.6 * sc_.enemySpread),
                      std::clamp(moveRng_.normal(0, sc_.enemySpread), -rules_.laneHalfWidth, rules_.laneHalfWidth)};
            e.pos = e.home;
            const double w = p && share > 0 ? p->damageShare / share : 1.0 / static_cast<double>(n);
            e.damageWeight = w;
        }
        primary_ = nearestAlive(me_);
    }
    Rng targetRng_{1, 1};

    Enemy spawnEnemy(const EnemyProfile* prof) {
        EnemyProfile p;
        if (prof) p = *prof;
        else { p.hp = sc_.targetHp; p.armor = sc_.targetArmor; p.mr = sc_.targetMr; p.moveSpeed = 0; p.reach = 550; }
        Enemy e;
        e.profile = prof;
        e.uid = nextUid_++;
        e.maxHp = p.hpSd > 0 ? std::max(0.5 * p.hp, targetRng_.normal(p.hp, p.hp * p.hpSd)) : p.hp;
        e.hp = e.maxHp;
        const double armor = std::max(0.0, p.armor * (1.0 - get(fx_, "armor_shred")) * (1.0 - armorPen_) - lethality_);
        const double mr = std::max(0.0, p.mr * (1.0 - get(fx_, "mr_shred")) * (1.0 - magicPenPct_) - magicPen_);
        const double amp = damageAmp_ * p.damageTaken;
        e.physMult = 100.0 / (100.0 + armor) * amp;
        e.magicMult = 100.0 / (100.0 + mr) * amp;
        e.trueMult = amp;
        e.moveSpeed = p.moveSpeed;
        e.reach = p.reach;
        if (trace_) {
            TraceEvent ev;
            ev.t = t_; ev.kind = "spawn"; ev.target = e.uid; ev.text = p.id; ev.hp = e.hp; ev.maxHp = e.maxHp;
            ev.amount = e.reach;  // how far its damage reaches, for the replay
            record(ev);
        }
        return e;
    }

    bool inCc(double t) const {
        for (const auto& [a, b] : cc_)
            if (t >= a && t < b) return true;
        return false;
    }

    double freeTime(double t) const {
        bool moved = true;
        while (moved) {
            moved = false;
            for (const auto& [a, b] : cc_)
                if (t >= a && t < b) { t = b; moved = true; }
        }
        return t;
    }

    int nearestAlive(Vec from) const {
        int best = -1;
        double bd = 1e18;
        for (size_t i = 0; i < enemies_.size(); ++i) {
            if (!enemies_[i].alive) continue;
            const double d = len(enemies_[i].pos - from);
            if (d < bd) { bd = d; best = static_cast<int>(i); }
        }
        return best;
    }

    // Centre-to-centre distance at which two champions touch or an attack connects.
    double attackReach() const { return ch_.attackRange + 2 * rules_.hitbox; }
    double distTo(const Enemy& e) const { return len(e.pos - me_); }

    // How close you need to be to the target to use ability a on it.
    double needRange(const Ability& a) const {
        const Geometry& g = a.geo;
        if (g.selfBuff || g.shape == Shape::Single) return (g.selfBuff ? ch_.attackRange : g.range) + 2 * rules_.hitbox;
        if (g.shape == Shape::Circle) return (g.onSelf ? g.radius : g.range + 0.6 * g.radius) + rules_.hitbox;
        if (g.move != Move::None) return g.range + rules_.hitbox;
        return g.range * 0.8 + rules_.hitbox;  // skillshots: thrown from a bit inside their range
    }

    // Moves everyone and applies the enemies' damage up to time t, in small steps.
    // Returns true if you died.
    bool advance(double t) {
        if (dead_) return true;
        t = std::min(t, duration_);
        while (posClock_ < t - 1e-9) {
            const double dt = std::min(kStep, t - posClock_);
            const double now = posClock_ + dt;
            for (auto& e : enemies_)
                if (!e.alive && now >= e.respawnAt) respawn(e, now);
            moveEnemies(now, dt);
            if (!inCc(posClock_) && posClock_ >= busyUntil_) moveMe(dt);
            tickAuras(now);
            // Damage taken: each enemy hits you only while you're within its reach.
            double dps = 0;
            if (now > engageAt_) {
                double share = 0;
                for (const auto& e : enemies_)
                    if (e.alive && distTo(e) <= e.reach + 2 * rules_.hitbox) share += e.damageWeight;
                dps = incomingDps_ * share;
                exposureSum_ += share * dt;
                exposureTime_ += dt;
            }
            posClock_ = now;
            if (dps > 0) {
                const double lost = dps * dt;
                if (lost >= myHp_) {
                    res_.damageTaken += myHp_;
                    dead_ = true;
                    res_.died = true;
                    res_.timeAlive = now - dt + myHp_ / dps;
                    myHp_ = 0;
                    recordSelf(res_.timeAlive, "death");
                    recordPositions(res_.timeAlive, true);
                    return true;
                }
                myHp_ -= lost;
                res_.damageTaken += lost;
                recordSelf(now);
            }
            recordPositions(now, false);
        }
        return false;
    }

    void respawn(Enemy& e, double now) {
        const double saved = t_;
        t_ = now;
        e = spawnEnemy(e.profile);
        t_ = saved;
        // The next enemy walks in from behind their team.
        e.home = {me_.x + sc_.startDistance, std::clamp(moveRng_.normal(0, sc_.enemySpread), -rules_.laneHalfWidth,
                                                         rules_.laneHalfWidth)};
        e.pos = e.home;
        if (primary_ < 0 || !enemies_[static_cast<size_t>(primary_)].alive) {
            primary_ = nearestAlive(me_);
            recordFocus();
        }
    }

    void clampLane(Vec& p) const { p.y = std::clamp(p.y, -rules_.laneHalfWidth, rules_.laneHalfWidth); }

    void moveEnemies(double now, double dt) {
        for (auto& e : enemies_) {
            if (!e.alive || e.moveSpeed <= 0) continue;
            const Vec toMe = me_ - e.pos;
            const Vec dir = unit(toMe, {-1, 0});
            const Vec side{-dir.y, dir.x};
            if (now >= e.strafeUntil) {  // a new sidestep every so often
                e.strafe = moveRng_.uniform(-0.6, 0.6);
                e.strafeUntil = now + moveRng_.uniform(0.4, 1.2);
            }
            Vec v{0, 0};
            if (now < e.dodgeUntil) {
                v = e.dodgeVel;
            } else {
                const double d = len(toMe);
                const double want = std::max(e.reach * 0.85, 2 * rules_.hitbox);
                if (now < engageAt_) v = (e.home - e.pos) * 2.0;  // hold position until the fight starts
                else if (d > want + 25) v = dir * e.moveSpeed;
                else if (e.reach >= 300 && d < want - 200) v = dir * (-0.45 * e.moveSpeed);  // ranged: back off between attacks
                v = v + side * (e.strafe * e.moveSpeed);
                const double sp = len(v);
                if (sp > e.moveSpeed) v = v * (e.moveSpeed / sp);
            }
            e.vel = v;
            e.pos = e.pos + v * dt;
            clampLane(e.pos);
        }
    }

    void moveMe(double dt) {
        if (!hasPrimary()) return;
        const Enemy& tgt = P();
        const Vec toT = tgt.pos - me_;
        const double d = len(toT);
        const double want = std::max(wantRange_ - 15, 2 * rules_.hitbox);
        Vec v{0, 0};
        if (d > want) {
            v = unit(toT) * moveSpeed_;
        } else if (ch_.attackRange >= 300) {
            // Ranged: step back from anyone short-ranged who is getting close, if the target stays in range.
            for (const auto& e : enemies_) {
                if (!e.alive || e.reach >= ch_.attackRange) continue;
                const Vec away = me_ - e.pos;
                if (len(away) < e.reach + 2 * rules_.hitbox + 80 && d < attackReach() - 60) {
                    v = unit(away) * (0.8 * moveSpeed_);
                    break;
                }
            }
        }
        const double step = std::min(len(v) * dt, std::max(0.0, d - 2 * rules_.hitbox));
        me_ = me_ + unit(v, {0, 0}) * step;
        clampLane(me_);
        me_.x = std::max(me_.x, -1200.0);  // your own tower: no retreating past it
    }

    void recordPositions(double t, bool force) {
        if (!trace_ || (!force && t + 1e-9 < nextPosAt_)) return;
        nextPosAt_ = t + kPosEvery;
        TraceEvent ev;
        ev.t = t; ev.kind = "pos";
        ev.pos = {-1, me_.x, me_.y};
        for (const auto& e : enemies_)
            if (e.alive) { ev.pos.push_back(e.uid); ev.pos.push_back(e.pos.x); ev.pos.push_back(e.pos.y); }
        record(ev);
    }

    void heal(double amount) {
        if (!dead_) myHp_ = std::min(maxHp_, myHp_ + amount);
    }

    void onKill(Enemy* target) {
        ++res_.kills;
        target->alive = false;
        target->respawnAt = t_ + sc_.retargetDelay;
        if (hasPrimary()) return;
        primary_ = nearestAlive(me_);
        recordFocus();
    }

    // Other living enemies within radius of a point, nearest first.
    std::vector<Enemy*> near(Vec at, double radius, const Enemy* skip = nullptr) {
        std::vector<std::pair<double, Enemy*>> found;
        for (auto& e : enemies_) {
            if (!e.alive || &e == skip) continue;
            const double d = len(e.pos - at);
            if (d <= radius + rules_.hitbox) found.push_back({d, &e});
        }
        std::sort(found.begin(), found.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
        std::vector<Enemy*> out;
        for (auto& f : found) out.push_back(f.second);
        return out;
    }

    double deal(Enemy* target, double raw, DamageType type, Source src, bool physicalAttack = false) {
        if (!target || !target->alive || raw <= 0) return 0.0;
        const double mult = type == DamageType::Physical ? target->physMult
                            : type == DamageType::Magic  ? target->magicMult
                                                         : target->trueMult;
        const double dmg = std::min(target->hp, raw * mult);
        heal(dmg * (omnivamp_ + (physicalAttack ? lifesteal_ : 0.0)));
        target->hp -= dmg;
        res_.bySource[src] += dmg;
        res_.totalDamage += dmg;
        const bool isPrimary = hasPrimary() && target == &P();
        if (isPrimary) res_.primaryDamage += dmg;
        const double execute = get(fx_, "execute");
        double executed = 0;
        if (execute > 0 && target->hp > 0 && target->hp < execute * target->maxHp) {
            executed = target->hp;
            res_.bySource[src] += target->hp;
            res_.totalDamage += target->hp;
            if (isPrimary) res_.primaryDamage += target->hp;
            target->hp = 0;
        }
        if (trace_) {
            TraceEvent ev;
            ev.t = t_; ev.kind = "damage"; ev.target = target->uid; ev.source = src;
            ev.text = type == DamageType::Physical ? "physical" : type == DamageType::Magic ? "magic" : "true";
            ev.amount = dmg + executed; ev.hp = target->hp; ev.maxHp = target->maxHp;
            record(ev);
            if (target->hp <= 0) {
                ev.kind = "kill"; ev.amount = 0;
                record(ev);
            }
        }
        if (target->hp <= 0) onKill(target);
        return dmg;
    }

    // Dashes and blinks: move toward the target, up to the ability's reach, stopping
    // at your attack range (ranged champions keep some distance).
    void dashFor(const Geometry& g) {
        if (g.move == Move::None || !hasPrimary()) return;
        const Vec toT = P().pos - me_;
        const double d = len(toT);
        const double stopAt = ch_.attackRange >= 300 ? 0.8 * ch_.attackRange : 2 * rules_.hitbox;
        const double step = std::clamp(d - stopAt, 0.0, g.range > 0 ? g.range : 350.0);
        me_ = me_ + unit(toT) * step;
        clampLane(me_);
        recordPositions(t_, true);
    }

    bool inside(const Geometry& g, Vec q, Vec origin, Vec dir, Vec center) const {
        const double hb = rules_.hitbox;
        const Vec rel = q - origin;
        switch (g.shape) {
            case Shape::Line: {
                const double along = dot(rel, dir);
                return along >= -hb && along <= g.range + hb && std::fabs(cross(dir, rel)) <= 0.5 * g.width + hb;
            }
            case Shape::Circle: return len(q - center) <= g.radius + hb;
            case Shape::Cone: {
                const double d = len(rel);
                if (d > g.range + hb) return false;
                if (d < hb) return true;
                const double off = std::acos(std::clamp(dot(rel * (1.0 / d), dir), -1.0, 1.0));
                return off <= 0.5 * g.angle * M_PI / 180.0 + std::atan(hb / d);
            }
            case Shape::Single: return false;
        }
        return false;
    }

    struct Shot {
        std::vector<Enemy*> hits;
        bool primaryHit = false;
        Vec aim;
        double flight = 0;
    };

    // Who an ability hits: where everyone will be when it lands, with enemies who
    // see a skillshot coming sidestepping it.
    Shot shoot(const Ability& a) {
        Shot s;
        const Geometry& g = a.geo;
        Enemy* tgt = hasPrimary() ? &P() : nullptr;
        if (!tgt) return s;
        if (g.selfBuff || g.shape == Shape::Single) {
            s.aim = tgt->pos;
            if (distTo(*tgt) <= needRange(a) + 1) { s.hits.push_back(tgt); s.primaryHit = true; }
            return s;
        }
        if (g.shape == Shape::Circle && g.onSelf) {
            s.aim = me_;
            s.hits = near(me_, g.radius);
            for (Enemy* e : s.hits) s.primaryHit |= e == tgt;
            return s;
        }
        double flight = g.speed > 0 ? distTo(*tgt) / g.speed : 0.0;
        const Vec lead = tgt->pos + tgt->vel * (flight * rules_.aimLead);
        const Vec dir = unit(lead - me_);
        Vec center = lead;
        if (g.shape == Shape::Circle) {
            if (len(center - me_) > g.range) center = me_ + dir * g.range;
            flight = g.speed > 0 ? len(center - me_) / g.speed : 0.0;
        }
        s.aim = g.shape == Shape::Circle ? center : me_ + dir * g.range;
        s.flight = flight;
        // Seconds a dodging enemy has to get out of the way: it sees the cast start.
        const double window = a.castTime + flight - rules_.reactionTime;
        std::vector<std::pair<double, Enemy*>> hit;
        for (auto& e : enemies_) {
            if (!e.alive) continue;
            Vec q = e.pos + e.vel * flight;
            if (!inside(g, q, me_, dir, center)) continue;
            if (window > 0 && e.moveSpeed > 0 && moveRng_.chance(rules_.dodgeChance)) {
                Vec away = g.shape == Shape::Circle ? unit(q - center, Vec{-dir.y, dir.x})
                                                    : Vec{-dir.y, dir.x} * (cross(dir, q - me_) >= 0 ? 1.0 : -1.0);
                const double room = e.moveSpeed * window;
                q = q + away * room;
                clampLane(q);
                // Its sidestep, for the replay: the part during the cast at once, the rest while it flies.
                e.dodgeVel = away * e.moveSpeed;
                e.dodgeUntil = t_ + flight;
                e.pos = e.pos + away * (e.moveSpeed * std::max(0.0, std::min(window, a.castTime - rules_.reactionTime)));
                clampLane(e.pos);
                if (inside(g, q, me_, dir, center)) hit.push_back({dot(q - me_, dir), &e});
            } else {
                hit.push_back({dot(q - me_, dir), &e});
            }
        }
        if (g.shape == Shape::Line && g.stops && hit.size() > 1) {
            std::sort(hit.begin(), hit.end(), [](const auto& x, const auto& y) { return x.first < y.first; });
            hit.resize(1);
        }
        for (auto& [d, e] : hit) {
            s.hits.push_back(e);
            s.primaryHit |= e == tgt;
        }
        // The main target first, so item procs land on it.
        std::stable_partition(s.hits.begin(), s.hits.end(), [&](Enemy* e) { return e == tgt; });
        return s;
    }

    double hitRaw(const Hit& h, const Enemy& e) const {
        double v = scaled(h.scaling);
        switch (h.target) {
            case HitTarget::MaxHp: v *= e.maxHp; break;
            case HitTarget::CurrentHp: v *= e.hp; break;
            case HitTarget::MissingHp: v *= (e.maxHp - e.hp); break;
            case HitTarget::Flat: break;
        }
        return v * h.weight;
    }

    // Expected multiplier when abilities can crit (Jeweled Gauntlet).
    double abilityCritFactor() const {
        if (get(fx_, "abilities_crit") <= 0) return 1.0;
        return 1.0 + crit_ * (get(fx_, "ability_crit_damage", rules_.critMult) - 1.0);
    }

    void onAbilityDamage(Enemy* e, bool first) {
        // Burns (Liandry's, Blackfire): one full burn per target per burn duration.
        const double burnDur = get(fx_, "burn_duration");
        if (burnDur > 0 && e->alive && t_ >= e->burnUntil) {
            const double perSec = get(fx_, "burn_max_hp") * e->maxHp + get(fx_, "burn_flat") + get(fx_, "burn_ap") * ap_;
            e->burnUntil = t_ + burnDur;
            deal(e, perSec * burnDur, DamageType::Magic, SrcItems);
        }
        // Infernal Conduit: a stacking burn that also shortens basic ability cooldowns.
        const double conduitDur = get(fx_, "conduit_duration");
        if (conduitDur > 0 && e->alive && t_ >= e->conduitAt) {
            e->conduitAt = t_ + 1.0;
            deal(e, get(fx_, "conduit_ap") * ap_ + get(fx_, "conduit_ad") * bonusAd_, DamageType::Magic, SrcItems);
            reduceCooldowns(get(fx_, "conduit_cdr_per_tick") * conduitDur, 0.0, false);
        }
        if (!first) return;
        for (auto& p : abilityProcs_) {
            if (t_ < p.readyAt || !e->alive) continue;
            p.readyAt = t_ + get(*p.fx, "proc_cd");
            const double dmg = get(*p.fx, "proc_flat") + get(*p.fx, "proc_ap") * ap_;
            deal(e, dmg, DamageType::Magic, SrcItems);
            int extra = static_cast<int>(get(*p.fx, "proc_targets", 1)) - 1;
            for (Enemy* s : near(e->pos, 600, e)) {
                if (extra-- <= 0) break;
                deal(s, dmg, DamageType::Magic, SrcItems);
            }
        }
        if (hasMissile_ && t_ >= missile_.readyAt && e->alive) {
            missile_.readyAt = t_ + get(*missile_.fx, "missile_cd");
            deal(e, get(*missile_.fx, "missile_count") * get(*missile_.fx, "missile_max_hp") * e->maxHp,
                 DamageType::True, SrcItems);
        }
    }

    void castAbility(size_t idx) {
        const Ability& a = ch_.abilities[idx];
        const Source src = a.slot == 'Q' ? SrcQ : a.slot == 'W' ? SrcW : a.slot == 'E' ? SrcE : SrcR;
        dashFor(a.geo);
        const Shot shot = shoot(a);
        const double amp = abilityAmp_ * abilityCritFactor();
        if (trace_) {
            TraceEvent ev;
            ev.t = t_ - a.castTime; ev.kind = "cast"; ev.slot = a.slot; ev.amount = a.castTime; ev.flag = shot.primaryHit;
            ev.target = hasPrimary() ? P().uid : -1;
            const Geometry& g = a.geo;
            ev.text = g.selfBuff ? "buff" : g.shape == Shape::Line ? "line" : g.shape == Shape::Cone ? "cone"
                      : g.shape == Shape::Circle ? (g.onSelf ? "self" : "circle") : "single";
            ev.x = shot.aim.x; ev.y = shot.aim.y; ev.flight = shot.flight;
            record(ev);
        }
        const auto& targets = shot.hits;
        bool first = true;
        for (Enemy* e : targets) {
            for (const auto& h : a.hits) {
                double raw = hitRaw(h, *e) * amp;
                if (h.perSecond) {
                    // Damage over time lasts its duration, but no longer than the ability's
                    // cooldown: a recast replaces it (and channels stop other actions anyway).
                    raw *= std::min(a.duration > 0 ? a.duration : rules_.dotDuration, cooldownOf(a));
                }
                deal(e, raw, h.type, src);
            }
            onAbilityDamage(e, first);
            first = false;
        }
        if (spellblade_ && t_ >= spellbladeReady_) {
            spellbladeArmed_ = true;
            spellbladeArmedAt_ = t_;
        }
    }

    // Navori and Mystic Punch: attacks shorten ability cooldowns.
    void reduceCooldowns(double flat, double pct, bool includeR) {
        for (size_t i = 0; i < readyAt_.size(); ++i) {
            if (ch_.abilities[i].slot == 'R' && !includeR) continue;
            if (readyAt_[i] > t_ && readyAt_[i] < 1e17) {
                double remaining = readyAt_[i] - t_;
                remaining = std::max(0.0, remaining * (1.0 - pct) - flat);
                readyAt_[i] = t_ + remaining;
            }
        }
    }

    void applyOnHit(Enemy* e, double scale) {
        if (!e || !e->alive) return;
        const double magic = get(fx_, "onhit_magic") + get(fx_, "onhit_magic_ap") * ap_;
        deal(e, scale * magic, DamageType::Magic, SrcItems);
        double phys = get(fx_, "onhit_phys") + get(fx_, "onhit_cur_hp") * e->hp + get(fx_, "onhit_own_hp") * maxHp_;
        deal(e, scale * phys, DamageType::Physical, SrcItems, true);
    }

    void basicAttack() {
        Enemy* e = &P();
        ++attacks_;
        const bool crit = rng_.chance(crit_);
        const double critMult = rules_.critMult + critDamage_;
        if (trace_) {
            TraceEvent ev;
            ev.t = t_; ev.kind = "attack"; ev.target = e->uid; ev.flag = crit;
            record(ev);
        }
        deal(e, ad_ * (crit ? critMult : 1.0), DamageType::Physical, SrcAttack, true);
        applyOnHit(e, 1.0);
        if (get(fx_, "phantom_every") > 0 && attacks_ % static_cast<int>(get(fx_, "phantom_every")) == 0)
            applyOnHit(e, 1.0);
        if (hasKraken_ && ++kraken_.counter >= static_cast<int>(get(*kraken_.fx, "kraken_every")) && e->alive) {
            kraken_.counter = 0;
            const double missing = 1.0 - e->hp / e->maxHp;
            deal(e, get(*kraken_.fx, "kraken_damage") * (1.0 + get(*kraken_.fx, "kraken_missing_amp") * missing),
                 DamageType::Physical, SrcItems);
        }
        if (hasStorm_ && ++storm_.counter >= static_cast<int>(get(*storm_.fx, "storm_every")) && e->alive) {
            storm_.counter = 0;
            deal(e, get(*storm_.fx, "storm_magic"), DamageType::Magic, SrcItems);
        }
        if (hasEclipse_ && t_ >= eclipse_.readyAt && e->alive) {
            eclipse_.readyAt = t_ + get(*eclipse_.fx, "maxhp_proc_cd");
            deal(e, get(*eclipse_.fx, "maxhp_proc") * e->maxHp, DamageType::Physical, SrcItems);
        }
        if (spellbladeArmed_ && t_ - spellbladeArmedAt_ <= rules_.spellbladeWindow && e->alive) {
            const Bag& f = *spellblade_;
            const double dmg = get(f, "spellblade_base_ad") * baseAd_ + get(f, "spellblade_bonus_ad") * bonusAd_ +
                               get(f, "spellblade_ap") * ap_;
            deal(e, dmg, get(f, "spellblade_magic") > 0 ? DamageType::Magic : DamageType::Physical, SrcItems);
            spellbladeArmed_ = false;
            spellbladeReady_ = t_ + get(f, "spellblade_cd");
        }
        // Dual Wield: a second, weaker bolt with partial on-hit.
        if (get(fx_, "second_bolt") > 0 && e->alive) {
            deal(e, get(fx_, "second_bolt") * ad_ * (crit ? critMult : 1.0), DamageType::Physical, SrcItems, true);
            applyOnHit(e, get(fx_, "second_bolt_onhit"));
        }
        if (!ch_.ranged && get(fx_, "cleave_ad") > 0)
            for (Enemy* s : near(e->pos, 350, e)) deal(s, get(fx_, "cleave_ad") * ad_, DamageType::Physical, SrcItems);
        if (ch_.ranged && get(fx_, "bolts") > 0) {
            int bolts = static_cast<int>(get(fx_, "bolts"));
            for (Enemy* s : near(me_, ch_.attackRange + rules_.hitbox, e)) {
                if (bolts-- <= 0) break;
                deal(s, get(fx_, "bolts_ad") * ad_ * (rng_.chance(crit_) ? critMult : 1.0), DamageType::Physical,
                     SrcItems, true);
            }
        }
        for (const Ability* a : onhitAbilities_) {
            if (attacks_ % a->onhitEvery != 0 || !e->alive) continue;
            const Source src = a->slot == 'Q' ? SrcQ : a->slot == 'W' ? SrcW : a->slot == 'E' ? SrcE : SrcR;
            if (trace_) {
                TraceEvent ev;
                ev.t = t_; ev.kind = "proc"; ev.slot = a->slot; ev.target = e->uid;
                record(ev);
            }
            for (const auto& h : a->hits) deal(e, hitRaw(h, *e) * abilityAmp_, h.type, src);
        }
        reduceCooldowns(get(fx_, "attack_cdr_flat"), get(fx_, "attack_cdr_pct"), false);
    }

    void tickAuras(double until) {
        if (until <= auraClock_) return;
        const double dt = until - auraClock_;
        auraClock_ = until;
        if (auraDps_ <= 0 && auraHits_.empty()) return;
        // Auras burn whoever stands close: item auras (Sunfire) reach 325, ability
        // auras their own radius.
        if (auraDps_ > 0)
            for (Enemy* e : near(me_, 325)) deal(e, auraDps_ * dt, DamageType::Magic, SrcItems);
        for (const auto& [a, h] : auraHits_) {
            const Source src = a->slot == 'Q' ? SrcQ : a->slot == 'W' ? SrcW : a->slot == 'E' ? SrcE : SrcR;
            const double radius = a->geo.shape == Shape::Circle && a->geo.onSelf ? a->geo.radius : 350.0;
            for (Enemy* e : near(me_, radius)) deal(e, hitRaw(*h, *e) * abilityAmp_ * dt, h->type, src);
        }
    }

    double cooldownOf(const Ability& a) const { return a.cooldown * 100.0 / (100.0 + ah_); }

};

Result Fight::run() {
    res_.duration = duration_;
    if (trace_) {
        trace_->engageAt = engageAt_;
        trace_->maxHp = maxHp_;
        for (const auto* e : team_) trace_->team.push_back(e->id);
        for (const auto& [a, b] : cc_) {
            TraceEvent ev;
            ev.t = a; ev.kind = "cc"; ev.amount = b;
            record(ev);
        }
        recordFocus();
        recordSelf(0);
    }
    for (size_t i = 0; i < ch_.abilities.size(); ++i)
        if (ch_.abilities[i].slot == 'R' && !rUp_) readyAt_[i] = 1e18;
    while (true) {
        // Crowd control: you can't act or move, but everyone else keeps going.
        const double free = std::min(freeTime(t_), duration_);
        if (advance(free)) break;
        t_ = std::max(t_, free);
        if (advance(t_) || t_ >= duration_) break;

        // Switch to a much closer enemy when the target is out of reach (it ran or kited).
        if (hasPrimary() && distTo(P()) > attackReach() + 100) {
            const int near = nearestAlive(me_);
            if (near >= 0 && near != primary_ && distTo(enemies_[static_cast<size_t>(near)]) < distTo(P()) - 200) {
                primary_ = near;
                recordFocus();
            }
        }
        if (!hasPrimary()) {
            primary_ = nearestAlive(me_);
            if (primary_ < 0) {  // everyone is down: wait for the next one to walk in
                double next = duration_;
                for (const auto& e : enemies_) next = std::min(next, e.respawnAt);
                t_ = std::max(t_ + kStep, next);
                continue;
            }
            recordFocus();
        }

        // Cast the first ready ability that reaches the target; otherwise walk
        // until it (or your attack) does.
        wantRange_ = attackReach();
        bool cast = false, waiting = false, holding = false;
        for (size_t i : order_) {
            if (readyAt_[i] > t_) continue;
            const Ability& a = ch_.abilities[i];
            const double need = needRange(a);
            if (distTo(P()) > need) {
                wantRange_ = std::min(wantRange_, need);
                // Nearly in range of an ability earlier in the combo: close in for it
                // rather than casting the later ones first.
                if (distTo(P()) - need < 400) holding = true;
                waiting = true;
                continue;
            }
            if (holding) continue;
            busyUntil_ = t_ + a.castTime;
            t_ += a.castTime;
            if (t_ >= duration_ || advance(t_)) break;
            if (!hasPrimary()) primary_ = nearestAlive(me_);
            if (primary_ >= 0) castAbility(i);
            readyAt_[i] = t_ + cooldownOf(a);
            nextAttack_ = std::max(nextAttack_, t_);
            cast = true;
            break;
        }
        if (dead_ || t_ >= duration_) break;
        if (cast) continue;

        for (auto& p : actives_) {
            if (t_ >= p.readyAt && distTo(P()) <= 700) {
                p.readyAt = t_ + get(*p.fx, "active_cd");
                deal(&P(), get(*p.fx, "active_flat") + get(*p.fx, "active_ap") * ap_, DamageType::Magic, SrcItems);
            }
        }
        if (!hasPrimary()) continue;

        const bool inRange = distTo(P()) <= attackReach();
        if (nextAttack_ > t_ || !inRange) {
            double nt = inRange ? nextAttack_ : t_ + kStep;
            if (waiting) nt = std::min(nt, t_ + kStep);
            for (size_t i : order_)
                if (readyAt_[i] > t_) nt = std::min(nt, readyAt_[i]);
            t_ = std::max(nt, t_ + 1e-9);
            continue;
        }
        basicAttack();
        nextAttack_ = t_ + 1.0 / attackSpeed_;
    }
    if (!dead_) {
        advance(duration_);
        if (!dead_) res_.timeAlive = duration_;
    }
    res_.exposure = exposureTime_ > 0 ? exposureSum_ / exposureTime_ : 0.0;
    if (trace_) {
        lastSelfAt_ = -1;
        recordSelf(dead_ ? res_.timeAlive : duration_);
        TraceEvent ev;
        ev.t = duration_; ev.kind = "end";
        record(ev);
        std::stable_sort(trace_->events.begin(), trace_->events.end(),
                         [](const TraceEvent& a, const TraceEvent& b) { return a.t < b.t; });
    }
    return res_;
}

}  // namespace

// How much of the enemies' damage can reach this champion, on average over a fight
// (fights with no items, so every build sees the same scaling).
double meanExposure(const Library& lib, const ChampionKit& c, const Scenario& sc) {
    double sum = 0;
    const int n = 48;
    for (int i = 0; i < n; ++i) sum += Fight(lib, c, Build{}, sc, 1000000 + static_cast<uint64_t>(i)).run().exposure;
    return sum / n;
}

std::vector<Result> runTrials(const Library& lib, const ChampionKit& champ, const Build& build, const Scenario& sc,
                              uint64_t firstTrial, int count) {
    lib.validate(build);
    std::vector<Result> out;
    out.reserve(static_cast<size_t>(std::max(0, count)));
    for (int i = 0; i < count; ++i)
        out.push_back(Fight(lib, champ, build, sc, firstTrial + static_cast<uint64_t>(i)).run());
    return out;
}

FightTrace traceFight(const Library& lib, const ChampionKit& champ, const Build& build, const Scenario& sc,
                      uint64_t trial) {
    lib.validate(build);
    FightTrace trace;
    trace.result = Fight(lib, champ, build, sc, trial, &trace).run();
    return trace;
}

Summary summarize(const std::vector<Result>& results) {
    Summary s;
    s.trials = static_cast<int>(results.size());
    if (results.empty()) return s;
    std::vector<double> dps;
    dps.reserve(results.size());
    double single = 0, kpm = 0, total = 0;
    for (const auto& r : results) {
        dps.push_back(r.totalDamage / r.duration);
        single += r.primaryDamage / r.duration;
        kpm += r.kills / r.duration * 60.0;
        s.survivalRate += r.died ? 0.0 : 1.0;
        s.meanTimeAlive += r.timeAlive;
        s.damageTakenPerSec += r.timeAlive > 0 ? r.damageTaken / r.timeAlive : 0.0;
        total += r.totalDamage;
        for (int i = 0; i < SrcCount; ++i) s.shareBySource[i] += r.bySource[i];
    }
    const double n = static_cast<double>(dps.size());
    s.meanDps = std::accumulate(dps.begin(), dps.end(), 0.0) / n;
    double var = 0;
    for (double x : dps) var += (x - s.meanDps) * (x - s.meanDps);
    var /= std::max(1.0, n - 1.0);
    s.ci95 = 1.96 * std::sqrt(var / n);
    std::sort(dps.begin(), dps.end());
    auto pct = [&](double p) { return dps[static_cast<size_t>(std::min(n - 1.0, std::floor(p * (n - 1.0))))]; };
    s.p5 = pct(0.05);
    s.median = pct(0.5);
    s.p95 = pct(0.95);
    s.singleTargetDps = single / n;
    s.killsPerMinute = kpm / n;
    s.survivalRate /= n;
    s.meanTimeAlive /= n;
    s.damageTakenPerSec /= n;
    if (total > 0)
        for (auto& x : s.shareBySource) x /= total;
    return s;
}

// ---------------------------------------------------------------------------
// Build optimizer
// ---------------------------------------------------------------------------

std::vector<std::string> fittingRoles(const ChampionKit& c) {
    // AP or AD kit, from the summed ability ratios; close calls get both.
    const bool ap = c.apRatios >= 0.5 * c.adRatios && c.apRatios > 0;
    const bool ad = c.adRatios >= 0.5 * c.apRatios || (c.apRatios == 0 && c.adRatios == 0);
    std::set<std::string> r;
    auto add = [&](std::initializer_list<const char*> xs) { for (auto x : xs) r.insert(x); };
    if (ap) add({"ap", "ap_onhit", "ap_tank"});
    if (ad) {
        if (c.role == "marksman") add({"crit", "onhit", "ad", "lethality"});
        else if (c.role == "assassin") add({"lethality", "ad", "crit", "ability_ad"});
        else if (c.role == "fighter") add({"bruiser", "ad", "lethality", "onhit", "ability_ad"});
        else if (c.role == "tank") add({"bruiser", "tank"});
        else add({"lethality", "ad", "crit", "ability_ad"});
    }
    if (c.role == "marksman") add({"onhit"});
    if (c.role == "tank" || c.role == "fighter" || c.role == "support") add({"tank"});
    return {r.begin(), r.end()};
}

namespace {

double score(const Library& lib, const ChampionKit& c, const Build& b, const Scenario& sc, int trials) {
    double sum = 0;
    for (const auto& r : runTrials(lib, c, b, sc, 0, trials)) sum += r.totalDamage / r.duration;
    return sum / trials;
}

// Runs fn(i) for i in [0, n) on up to `threads` threads.
template <class F>
void parallelFor(int n, int threads, F fn) {
#ifdef __EMSCRIPTEN__
    threads = 1;
#endif
    threads = std::max(1, std::min(threads, n));
    if (threads == 1) {
        for (int i = 0; i < n; ++i) fn(i);
        return;
    }
#ifndef __EMSCRIPTEN__
    std::vector<std::thread> pool;
    for (int t = 0; t < threads; ++t)
        pool.emplace_back([&, t] {
            for (int i = t; i < n; i += threads) fn(i);
        });
    for (auto& th : pool) th.join();
#endif
}

void combinations(int n, int k, int start, std::vector<int>& cur, std::vector<std::vector<int>>& out) {
    if (static_cast<int>(cur.size()) == k) { out.push_back(cur); return; }
    for (int i = start; i <= n - (k - static_cast<int>(cur.size())); ++i) {
        cur.push_back(i);
        combinations(n, k, i + 1, cur, out);
        cur.pop_back();
    }
}

}  // namespace

std::vector<Ranked> optimize(const Library& lib, const ChampionKit& c, const Scenario& sc, int threads, int top) {
    const OptimizerSettings& os = lib.optimizer;
    std::vector<std::string> boots, legendaries;
    const auto roles = fittingRoles(c);
    for (const auto& [k, e] : lib.items) {
        bool fits = !os.fittingItemsOnly;
        for (const auto& r : e.roles) fits |= std::find(roles.begin(), roles.end(), r) != roles.end();
        if (fits) (e.slot == "boots" ? boots : legendaries).push_back(k);
    }
    if (boots.empty() || static_cast<int>(legendaries.size()) < os.legendarySlots)
        throw std::runtime_error("not enough fitting items for " + c.name);
    const int screen = os.screenTrials * 3;

    // 1. Greedy: add the item that helps most, one slot at a time. Remember the
    //    runners-up at every step: they are the candidates for the full search.
    Build greedy;
    std::set<std::string> candidates;
    std::vector<double> sc1(std::max(boots.size(), legendaries.size()));
    parallelFor(static_cast<int>(boots.size()), threads,
                [&](int i) { sc1[i] = score(lib, c, Build{{boots[i]}, {}}, sc, screen); });
    std::string bestBoots = boots[std::max_element(sc1.begin(), sc1.begin() + boots.size()) - sc1.begin()];
    greedy.items.push_back(bestBoots);
    for (int slot = 0; slot < os.legendarySlots; ++slot) {
        std::vector<std::pair<double, std::string>> scored(legendaries.size());
        parallelFor(static_cast<int>(legendaries.size()), threads, [&](int i) {
            Build b = greedy;
            if (std::find(b.items.begin(), b.items.end(), legendaries[i]) != b.items.end()) {
                scored[i] = {-1, legendaries[i]};
                return;
            }
            b.items.push_back(legendaries[i]);
            scored[i] = {score(lib, c, b, sc, screen), legendaries[i]};
        });
        std::sort(scored.rbegin(), scored.rend());
        greedy.items.push_back(scored[0].second);
        const int keep = std::max(3, os.candidates / os.legendarySlots + 1);
        for (int i = 0; i < keep && i < static_cast<int>(scored.size()); ++i) candidates.insert(scored[i].second);
    }
    std::vector<std::string> pool(candidates.begin(), candidates.end());
    // Keep the pool to the configured size, preferring the greedy picks.
    if (static_cast<int>(pool.size()) > os.candidates) {
        std::vector<std::string> trimmed(greedy.items.begin() + 1, greedy.items.end());
        for (const auto& p : pool)
            if (static_cast<int>(trimmed.size()) < os.candidates &&
                std::find(trimmed.begin(), trimmed.end(), p) == trimmed.end())
                trimmed.push_back(p);
        pool = trimmed;
    }

    // 2. Every combination of the candidates, with the greedy boots.
    std::vector<std::vector<int>> combos;
    std::vector<int> cur;
    const int k = std::min(os.legendarySlots, static_cast<int>(pool.size()));
    combinations(static_cast<int>(pool.size()), k, 0, cur, combos);
    std::vector<std::pair<double, int>> results(combos.size());
    parallelFor(static_cast<int>(combos.size()), threads, [&](int i) {
        Build b{{bestBoots}, {}};
        for (int j : combos[i]) b.items.push_back(pool[j]);
        results[i] = {score(lib, c, b, sc, os.screenTrials), i};
    });
    std::sort(results.rbegin(), results.rend());

    // 3. Augments, greedily, on the best item build.
    Build best{{bestBoots}, {}};
    for (int j : combos[results[0].second]) best.items.push_back(pool[j]);
    std::vector<std::string> augs;
    for (const auto& [key, a] : lib.augments) augs.push_back(key);
    std::vector<std::string> chosenAugs;
    for (int slot = 0; slot < os.augmentSlots && slot < static_cast<int>(augs.size()); ++slot) {
        std::vector<std::pair<double, std::string>> scored(augs.size());
        parallelFor(static_cast<int>(augs.size()), threads, [&](int i) {
            if (std::find(chosenAugs.begin(), chosenAugs.end(), augs[i]) != chosenAugs.end()) {
                scored[i] = {-1, augs[i]};
                return;
            }
            Build b = best;
            b.augments = chosenAugs;
            b.augments.push_back(augs[i]);
            scored[i] = {score(lib, c, b, sc, screen), augs[i]};
        });
        std::sort(scored.rbegin(), scored.rend());
        chosenAugs.push_back(scored[0].second);
    }

    // 4. Finalists: the top item builds with those augments, every boots option on
    //    the leader, all re-run with many more fights.
    std::vector<Build> finalists;
    for (int i = 0; i < os.finalists && i < static_cast<int>(results.size()); ++i) {
        Build b{{bestBoots}, chosenAugs};
        for (int j : combos[results[i].second]) b.items.push_back(pool[j]);
        finalists.push_back(b);
    }
    for (const auto& bt : boots) {
        if (bt == bestBoots) continue;
        Build b = finalists.front();
        b.items[0] = bt;
        finalists.push_back(b);
    }
    std::vector<Ranked> ranked(finalists.size());
    parallelFor(static_cast<int>(finalists.size()), threads, [&](int i) {
        ranked[i] = {finalists[i], summarize(runTrials(lib, c, finalists[i], sc, 0, os.finalTrials))};
    });
    std::sort(ranked.begin(), ranked.end(),
              [](const Ranked& a, const Ranked& b) { return a.summary.meanDps > b.summary.meanDps; });
    if (static_cast<int>(ranked.size()) > top) ranked.resize(static_cast<size_t>(top));
    return ranked;
}

}  // namespace mayhem
