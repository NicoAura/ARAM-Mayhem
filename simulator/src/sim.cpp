#include "sim.hpp"
#include "rng.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

namespace yunara {

const char* const kSourceNames[SrcCount] = {
    "Basic attacks", "Passive (crit magic)", "Q on-hit", "Q spread", "W", "Item on-hit", "Extra bolts",
};

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

void StatBlock::add(const StatBlock& o) {
    ad += o.ad; ap += o.ap; attackSpeed += o.attackSpeed; crit += o.crit; hp += o.hp;
    armor += o.armor; mr += o.mr; lifesteal += o.lifesteal;
    armorPenPct = 1.0 - (1.0 - armorPenPct) * (1.0 - o.armorPenPct);
    lethality += o.lethality; magicPenFlat += o.magicPenFlat;
    magicPenPct = 1.0 - (1.0 - magicPenPct) * (1.0 - o.magicPenPct);
    critDamage += o.critDamage; apAmp += o.apAmp;
    onhitPhys += o.onhitPhys; onhitMagic += o.onhitMagic; onhitMagicAp += o.onhitMagicAp;
    onhitCurHpPhys += o.onhitCurHpPhys;
}

StatBlock StatBlock::fromJson(const json::Value& v) {
    StatBlock s;
    s.ad = v["ad"].asNumber();
    s.ap = v["ap"].asNumber();
    s.attackSpeed = v["attack_speed"].asNumber();
    s.crit = v["crit"].asNumber();
    s.hp = v["hp"].asNumber();
    s.armor = v["armor"].asNumber();
    s.mr = v["mr"].asNumber();
    s.lifesteal = v["lifesteal"].asNumber();
    s.armorPenPct = v["armor_pen_pct"].asNumber();
    s.lethality = v["lethality"].asNumber();
    s.magicPenFlat = v["magic_pen_flat"].asNumber();
    s.magicPenPct = v["magic_pen_pct"].asNumber();
    s.critDamage = v["crit_damage"].asNumber();
    s.apAmp = v["ap_amp"].asNumber();
    s.onhitPhys = v["onhit_phys"].asNumber();
    s.onhitMagic = v["onhit_magic"].asNumber();
    s.onhitMagicAp = v["onhit_magic_ap"].asNumber();
    s.onhitCurHpPhys = v["onhit_cur_hp_phys"].asNumber();
    return s;
}

double Effect::param(const std::string& key, double fallback) const {
    auto it = params.find(key);
    return it == params.end() ? fallback : it->second;
}

namespace {

std::vector<double> numbers(const json::Value& v) {
    std::vector<double> out;
    for (const auto& x : v.arr) out.push_back(x.asNumber());
    return out;
}

double ruleValue(const json::Value& rules, const char* key, double fallback) {
    const json::Value& r = rules[key];
    if (r.isObject()) return r["value"].asNumber(fallback);
    return r.asNumber(fallback);
}

std::map<std::string, Effect> loadEffects(const json::Value& obj) {
    std::map<std::string, Effect> out;
    for (const auto& [id, v] : obj.obj) {
        if (!v.isObject()) continue;  // skip "_note" entries
        Effect e;
        e.id = id;
        e.name = v["name"].asString(id);
        e.special = v["special"].asString();
        e.requiresItem = v["requires_item"].asString();
        e.rarity = v["rarity"].asString();
        e.offeredToYunara = v["offered_to_yunara"].asString("confirmed") == "confirmed";
        e.stats = StatBlock::fromJson(v["stats"]);
        for (const auto& [k, p] : v["params"].obj) e.params[k] = p.asNumber();
        for (const auto& opt : v["anvil_options"].arr) e.anvilOptions.push_back(StatBlock::fromJson(opt));
        out[id] = e;
    }
    return out;
}

}  // namespace

GameData GameData::fromJson(const json::Value& root) {
    GameData d;
    const json::Value& rules = root["mayhem_rules"];
    d.rules.baseCritMult = ruleValue(rules, "base_crit_multiplier", 2.0);
    d.rules.critOverflowAdPerPercent = ruleValue(rules, "crit_overflow_ad_per_percent", 0.45);
    d.rules.asCap = ruleValue(rules, "attack_speed_cap", 5.0);
    d.rules.asCapLethalTempo = ruleValue(rules, "attack_speed_cap_lethal_tempo", 10.0);
    d.rules.damageDealt = ruleValue(rules, "yunara_damage_dealt", 1.0);

    const json::Value& c = root["champion"];
    Champion& ch = d.champ;
    const json::Value& base = c["base"];
    ch.baseAd = base["ad"].asNumber(ch.baseAd);
    ch.adGrowth = base["ad_growth"].asNumber(ch.adGrowth);
    ch.baseAs = base["attack_speed"].asNumber(ch.baseAs);
    ch.asRatio = base["attack_speed_ratio"].asNumber(ch.asRatio);
    ch.asGrowth = base["attack_speed_growth"].asNumber(ch.asGrowth);
    ch.baseHp = base["hp"].asNumber(ch.baseHp);
    ch.hpGrowth = base["hp_growth"].asNumber(ch.hpGrowth);
    ch.baseArmor = base["armor"].asNumber(ch.baseArmor);
    ch.armorGrowth = base["armor_growth"].asNumber(ch.armorGrowth);
    ch.baseMr = base["mr"].asNumber(ch.baseMr);
    ch.mrGrowth = base["mr_growth"].asNumber(ch.mrGrowth);
    ch.passiveRatio = c["passive"]["crit_bonus_magic_ratio"].asNumber(ch.passiveRatio);
    ch.passivePer100Ap = c["passive"]["crit_bonus_magic_per_100ap"].asNumber(ch.passivePer100Ap);

    const json::Value& q = c["q"];
    ch.qRank = static_cast<int>(q["rank"].asNumber(5));
    ch.qOnhit = numbers(q["onhit_magic"]);
    ch.qOnhitAp = q["onhit_ap_ratio"].asNumber(ch.qOnhitAp);
    ch.qStacksNeeded = q["stacks_needed"].asNumber(ch.qStacksNeeded);
    ch.qActiveDuration = q["active_duration"].asNumber(ch.qActiveDuration);
    ch.qActiveAs = numbers(q["active_attack_speed"]);
    ch.qActiveOnhit = numbers(q["active_onhit_magic"]);
    ch.qActiveOnhitAp = q["active_onhit_ap_ratio"].asNumber(ch.qActiveOnhitAp);
    ch.qSpreadAd = q["spread_ad_ratio"].asNumber(ch.qSpreadAd);

    const json::Value& w = c["w"];
    ch.wRank = static_cast<int>(w["rank"].asNumber(5));
    ch.wCooldown = w["cooldown"].asNumber(ch.wCooldown);
    ch.wImpact = numbers(w["impact_magic"]);
    ch.wAdRatio = w["impact_ad_ratio"].asNumber(ch.wAdRatio);
    ch.wApRatio = w["impact_ap_ratio"].asNumber(ch.wApRatio);
    ch.wLingerRatio = w["linger_ratio"].asNumber(ch.wLingerRatio);
    ch.wLingerSecondaryChance = w["linger_secondary_hit_chance"].asNumber(ch.wLingerSecondaryChance);
    ch.wCastMax = w["cast_time_max"].asNumber(ch.wCastMax);
    ch.wCastMin = w["cast_time_min"].asNumber(ch.wCastMin);
    ch.ruinCastMax = w["ruin_cast_time_max"].asNumber(ch.ruinCastMax);
    ch.ruinCastMin = w["ruin_cast_time_min"].asNumber(ch.ruinCastMin);
    ch.ruinDamageMult = w["ruin_damage_multiplier"].asNumber(ch.ruinDamageMult);
    ch.ruinCooldownMult = w["ruin_cooldown_multiplier"].asNumber(ch.ruinCooldownMult);

    ch.eCooldown = c["e"]["cooldown"].asNumber(ch.eCooldown);
    ch.eDashTime = c["e"]["dash_time"].asNumber(ch.eDashTime);

    const json::Value& r = c["r"];
    ch.rRank = static_cast<int>(r["rank"].asNumber(3));
    ch.rDuration = r["duration"].asNumber(ch.rDuration);
    ch.rCooldown = numbers(r["cooldown_mayhem"]);
    ch.rWRefund = r["w_cooldown_refund_on_toggle"].asNumber(ch.rWRefund);

    auto rankOk = [](const std::vector<double>& v, int rank, const char* what) {
        if (rank < 1 || rank > static_cast<int>(v.size()))
            throw std::runtime_error(std::string("rank out of range for ") + what);
    };
    rankOk(ch.qOnhit, ch.qRank, "q.onhit_magic");
    rankOk(ch.qActiveAs, ch.qRank, "q.active_attack_speed");
    rankOk(ch.qActiveOnhit, ch.qRank, "q.active_onhit_magic");
    rankOk(ch.wImpact, ch.wRank, "w.impact_magic");

    d.items = loadEffects(root["items"]);
    d.augments = loadEffects(root["augments"]);

    for (const auto& [id, b] : root["builds"].obj) {
        Build build;
        build.id = id;
        build.name = b["name"].asString(id);
        for (const auto& x : b["items"].arr) build.items.push_back(x.asString());
        for (const auto& x : b["augments"].arr) build.augments.push_back(x.asString());
        d.builds[id] = build;
        d.buildOrder.push_back(id);
    }

    d.scenario = Scenario::fromJson(root["scenario"]);
    return d;
}

Scenario Scenario::fromJson(const json::Value& s) {
    Scenario sc;
    sc.level = static_cast<int>(s["level"].asNumber(sc.level));
    sc.trials = static_cast<int>(s["trials"].asNumber(sc.trials));
    sc.seed = static_cast<uint64_t>(s["seed"].asNumber(static_cast<double>(sc.seed)));
    sc.fightMean = s["fight_mean"].asNumber(sc.fightMean);
    sc.fightSd = s["fight_sd"].asNumber(sc.fightSd);
    sc.fightMin = s["fight_min"].asNumber(sc.fightMin);
    sc.fightMax = s["fight_max"].asNumber(sc.fightMax);
    sc.ccRateMin = s["cc_rate_min"].asNumber(sc.ccRateMin);
    sc.ccRateMax = s["cc_rate_max"].asNumber(sc.ccRateMax);
    sc.ccMin = s["cc_min"].asNumber(sc.ccMin);
    sc.ccMax = s["cc_max"].asNumber(sc.ccMax);
    sc.clumpMax = static_cast<int>(s["clump_max"].asNumber(sc.clumpMax));
    sc.clumpChance = s["clump_chance"].asNumber(sc.clumpChance);
    sc.wHitChance = s["w_hit_chance"].asNumber(sc.wHitChance);
    sc.rReadyChance = s["r_ready_chance"].asNumber(sc.rReadyChance);
    sc.retargetDelay = s["retarget_delay"].asNumber(sc.retargetDelay);
    sc.targetHp = s["target_hp"].asNumber(sc.targetHp);
    sc.targetArmor = s["target_armor"].asNumber(sc.targetArmor);
    sc.targetMr = s["target_mr"].asNumber(sc.targetMr);
    sc.enemyDpsMean = s["enemy_dps_mean"].asNumber(sc.enemyDpsMean);
    sc.enemyDpsSd = s["enemy_dps_sd"].asNumber(sc.enemyDpsSd);
    sc.enemyPhysShare = s["enemy_phys_share"].asNumber(sc.enemyPhysShare);
    sc.engageMin = s["engage_min"].asNumber(sc.engageMin);
    sc.engageMax = s["engage_max"].asNumber(sc.engageMax);
    for (const auto& e : s["enemy_team"].arr) {
        EnemyProfile p;
        p.id = e["id"].asString();
        p.name = e["name"].asString(p.id);
        p.weight = e["weight"].asNumber(1.0);
        p.hp = e["hp"].asNumber(p.hp);
        p.hpSd = e["hp_sd"].asNumber(0.0);
        p.armor = e["armor"].asNumber(p.armor);
        p.mr = e["mr"].asNumber(p.mr);
        p.damageTaken = e["damage_taken"].asNumber(1.0);
        sc.enemies.push_back(p);
    }
    sc.fixedTarget = sc.enemies.empty();
    return sc;
}

void Scenario::applyEnemyPool(const json::Value& pool, int excludeChampionId) {
    enemies.clear();
    for (const auto& e : pool["enemies"].arr) {
        EnemyProfile p;
        p.id = e["id"].asString();
        p.name = e["name"].asString(p.id);
        p.championId = static_cast<int>(e["champion_id"].asNumber(0));
        p.weight = e["weight"].asNumber(0.0);
        p.hp = e["hp"].asNumber(p.hp);
        p.armor = e["armor"].asNumber(p.armor);
        p.mr = e["mr"].asNumber(p.mr);
        p.damageTaken = e["damage_taken"].asNumber(1.0);
        p.cc = e["cc"].asNumber(1.0);
        p.physShare = e["phys_share"].asNumber(0.5);
        p.damageShare = e["damage_share"].asNumber(0.2);
        // Mayhem has no mirror matches, so a champion never fights itself.
        if (p.weight > 0 && (excludeChampionId == 0 || p.championId != excludeChampionId)) enemies.push_back(p);
    }
    if (enemies.empty()) throw std::runtime_error("enemy pool has no enemies");
    fixedTarget = false;
    teamSize = static_cast<int>(pool["team"]["size"].asNumber(5));
    ccRatePerPoint = pool["team"]["cc_rate_per_point"].asNumber(0.0);
    teamDrivenDamage = true;
    enemySource = pool["meta"]["source"].asString("enemy pool") + ", " + pool["meta"]["champion_stat_date"].asString("");
}

void GameData::applyEnemyPool(const json::Value& pool) {
    scenario.applyEnemyPool(pool);
    scenario.damageTakenFactor = pool["yunara"]["damage_taken_factor"].asNumber(1.0);
}

void GameData::validate(const Build& b) const {
    for (const auto& i : b.items)
        if (!items.count(i)) throw std::runtime_error("unknown item '" + i + "' in build " + b.id);
    for (const auto& a : b.augments) {
        auto it = augments.find(a);
        if (it == augments.end()) throw std::runtime_error("unknown augment '" + a + "' in build " + b.id);
        const std::string& req = it->second.requiresItem;
        if (!req.empty() && std::find(b.items.begin(), b.items.end(), req) == b.items.end())
            throw std::runtime_error("augment '" + a + "' needs item '" + req + "' in build " + b.id);
    }
}

namespace {

using mcrng::Rng;

// ---------------------------------------------------------------------------
// One teamfight
// ---------------------------------------------------------------------------

struct Enemy {
    double hp = 0, maxHp = 0;
    double physMult = 1, magicMult = 1;  // damage multipliers after resists and modifiers
    bool alive = true;
    double respawnAt = 0;
};

class Fight {
public:
    Fight(const GameData& data, const Build& build, const Scenario& sc, uint64_t trial)
        : d_(data), ch_(data.champ), sc_(sc), rng_(sc.seed, trial) {
        setupBuild(build);
        setupScenario();
    }

    TrialResult run();

private:
    const GameData& d_;
    const Champion& ch_;
    const Scenario& sc_;
    Rng rng_;
    TrialResult res_;

    // Build-derived values
    StatBlock bonus_;
    double baseAd_ = 0, staticAd_ = 0, ap_ = 0, crit_ = 0, critMult_ = 2.0, staticBonusAs_ = 0;
    double totalWeight_ = 0;
    std::vector<const EnemyProfile*> team_;
    // Yunara's own survival
    double myHp_ = 0, myMaxHp_ = 0, incomingDps_ = 0, engageAt_ = 0, damageClock_ = 0;
    bool dead_ = false;
    bool hasSoulSiphon_ = false;
    const Effect* soulSiphon_ = nullptr;
    bool hasRunaan_ = false, hasRageblade_ = false, hasKraken_ = false, hasStorm_ = false, hasYuntal_ = false;
    bool hasSymphony_ = false, hasRhythm_ = false, hasDoubleTap_ = false, hasGauntlet_ = false;
    bool hasMysticPunch_ = false, hasTyphoon_ = false, hasDualWield_ = false, hasCritMissile_ = false;
    double executeThreshold_ = 0;
    const Effect *runaan_ = nullptr, *rageblade_ = nullptr, *kraken_ = nullptr, *storm_ = nullptr,
                 *yuntal_ = nullptr, *symphony_ = nullptr, *rhythm_ = nullptr, *mystic_ = nullptr,
                 *typhoon_ = nullptr, *dualWield_ = nullptr, *critMissile_ = nullptr;

    // Scenario
    double duration_ = 0;
    std::vector<std::pair<double, double>> cc_;
    bool rAvailable_ = false;

    // Fight state
    double t_ = 0, nextAttack_ = 0;
    double qStacks_ = 0, qActiveUntil_ = -1;
    double wReadyAt_ = 0, eReadyAt_ = 0;
    bool rActive_ = false;
    double rEnd_ = 0;
    int seething_ = 0, phantomCount_ = 0;
    double lastAttack_ = -100;
    int krakenCount_ = 0, stormCount_ = 0, dualWieldCount_ = 0;
    int ltStacks_ = 0;
    double ltLast_ = -100;
    int conqStacks_ = 0;
    double conqLast_ = -100;
    int rhythmStacks_ = 0;
    double rhythmUntil_ = -1;
    double flurryUntil_ = -1;

    Enemy primary_;
    double primaryRespawnAt_ = 0;
    std::vector<Enemy> secondaries_;

    double levelScale() const {
        double l = sc_.level - 1;
        return l * (0.7025 + 0.0175 * l);
    }

    void setupBuild(const Build& build) {
        for (const auto& id : build.items) {
            const Effect& e = d_.items.at(id);
            bonus_.add(e.stats);
            noteSpecial(e);
        }
        for (const auto& id : build.augments) {
            const Effect& e = d_.augments.at(id);
            bonus_.add(e.stats);
            noteSpecial(e);
            if (e.special == "stats_on_stats" && !e.anvilOptions.empty()) {
                int anvils = static_cast<int>(e.param("anvils", 3));
                for (int i = 0; i < anvils; ++i) bonus_.add(e.anvilOptions[rng_.pick(e.anvilOptions.size())]);
            }
        }

        const double g = levelScale();
        baseAd_ = ch_.baseAd + ch_.adGrowth * g;
        ap_ = bonus_.ap * (1.0 + bonus_.apAmp);

        crit_ = bonus_.crit;
        for (const auto& id : build.items) {
            const Effect& e = d_.items.at(id);
            if (e.special == "atma")
                crit_ += std::min(e.param("max_crit", 0.3), bonus_.hp / 100.0 * e.param("crit_per_100_bonus_hp", 0.01));
        }
        double bonusAd = bonus_.ad;
        if (crit_ > 1.0) {
            bonusAd += (crit_ - 1.0) * 100.0 * d_.rules.critOverflowAdPerPercent;
            crit_ = 1.0;
        }
        staticAd_ = baseAd_ + bonusAd;
        critMult_ = d_.rules.baseCritMult + bonus_.critDamage;
        staticBonusAs_ = ch_.asGrowth * g + bonus_.attackSpeed;

        myMaxHp_ = ch_.baseHp + ch_.hpGrowth * g + bonus_.hp;
        myHp_ = myMaxHp_;
    }

    // Draws this fight's enemy team by pick weight, without repeats when the
    // pool is big enough (champion pools), with repeats otherwise (archetypes).
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
            if (pick == pool.size())  // rounding: take the last available
                for (size_t i = pool.size(); i-- > 0;)
                    if (!taken[i]) { pick = i; break; }
            team_.push_back(&pool[pick]);
            if (distinct) { taken[pick] = true; remaining -= pool[pick].weight; }
        }
    }

    Enemy spawnEnemy() {
        EnemyProfile p;
        if (sc_.fixedTarget) {
            p.hp = sc_.targetHp; p.armor = sc_.targetArmor; p.mr = sc_.targetMr;
        } else {
            p = *team_[rng_.pick(team_.size())];
        }
        Enemy e;
        e.maxHp = p.hpSd > 0 ? std::max(0.5 * p.hp, rng_.normal(p.hp, p.hp * p.hpSd)) : p.hp;
        e.hp = e.maxHp;
        const double armor = std::max(0.0, p.armor * (1.0 - bonus_.armorPenPct) - bonus_.lethality);
        const double mr = std::max(0.0, p.mr * (1.0 - bonus_.magicPenPct) - bonus_.magicPenFlat);
        e.physMult = 100.0 / (100.0 + armor) * d_.rules.damageDealt * p.damageTaken;
        e.magicMult = 100.0 / (100.0 + mr) * d_.rules.damageDealt * p.damageTaken;
        return e;
    }

    // Applies incoming damage up to time t. Returns true once Yunara is dead.
    bool takeDamageUntil(double t) {
        if (dead_) return true;
        const double from = std::max(damageClock_, engageAt_);
        if (t > from && incomingDps_ > 0) {
            const double lost = incomingDps_ * (t - from);
            if (lost >= myHp_) {
                dead_ = true;
                res_.died = true;
                res_.timeAlive = from + myHp_ / incomingDps_;
                myHp_ = 0;
                return true;
            }
            myHp_ -= lost;
        }
        damageClock_ = std::max(damageClock_, t);
        return false;
    }

    void heal(double amount) {
        if (!dead_) myHp_ = std::min(myMaxHp_, myHp_ + amount);
    }

    void noteSpecial(const Effect& e) {
        const std::string& s = e.special;
        if (s == "runaan") { hasRunaan_ = true; runaan_ = &e; }
        else if (s == "rageblade") { hasRageblade_ = true; rageblade_ = &e; }
        else if (s == "kraken") { hasKraken_ = true; kraken_ = &e; }
        else if (s == "stormrazor") { hasStorm_ = true; storm_ = &e; }
        else if (s == "yuntal") { hasYuntal_ = true; yuntal_ = &e; }
        else if (s == "execute") executeThreshold_ = std::max(executeThreshold_, e.param("threshold", 0.05));
        else if (s == "symphony") { hasSymphony_ = true; symphony_ = &e; }
        else if (s == "critical_rhythm") { hasRhythm_ = true; rhythm_ = &e; }
        else if (s == "double_tap") hasDoubleTap_ = true;
        else if (s == "jeweled_gauntlet") hasGauntlet_ = true;
        else if (s == "mystic_punch") { hasMysticPunch_ = true; mystic_ = &e; }
        else if (s == "typhoon") { hasTyphoon_ = true; typhoon_ = &e; }
        else if (s == "soul_siphon") { hasSoulSiphon_ = true; soulSiphon_ = &e; }
        else if (s == "dual_wield") { hasDualWield_ = true; dualWield_ = &e; }
        else if (s == "critical_missile") { hasCritMissile_ = true; critMissile_ = &e; }
    }

    void setupScenario() {
        duration_ = std::clamp(rng_.normal(sc_.fightMean, sc_.fightSd), sc_.fightMin, sc_.fightMax);
        for (const auto& e : sc_.enemies) totalWeight_ += e.weight;
        if (!sc_.fixedTarget) drawTeam();

        // Some enemy teams bring far more crowd control than others.
        double ccRate = rng_.uniform(sc_.ccRateMin, sc_.ccRateMax);
        if (sc_.ccRatePerPoint > 0 && !team_.empty()) {
            double points = 0;
            for (const auto* e : team_) points += e->cc;
            ccRate = sc_.ccRatePerPoint * points;
        }
        if (ccRate > 0) {
            for (double t = rng_.exponential(ccRate); t < duration_; t += rng_.exponential(ccRate))
                cc_.push_back({t, t + rng_.uniform(sc_.ccMin, sc_.ccMax)});
        }
        rAvailable_ = rng_.chance(sc_.rReadyChance);
        primary_ = spawnEnemy();
        secondaries_.resize(static_cast<size_t>(rng_.binomial(sc_.clumpMax, sc_.clumpChance)));
        for (auto& e : secondaries_) e = spawnEnemy();

        const double g = levelScale();
        const double armor = ch_.baseArmor + ch_.armorGrowth * g + bonus_.armor;
        const double mr = ch_.baseMr + ch_.mrGrowth * g + bonus_.mr;
        double physShare = sc_.enemyPhysShare, teamDamage = 1.0;
        if (sc_.teamDrivenDamage && !team_.empty()) {
            // Damage type follows the drawn champions, weighted by how much of
            // their team's damage each one usually deals; a damage-heavy comp hits harder.
            double share = 0, phys = 0;
            for (const auto* e : team_) { share += e->damageShare; phys += e->damageShare * e->physShare; }
            if (share > 0) physShare = phys / share;
            teamDamage = share / (0.2 * static_cast<double>(team_.size()));
        }
        const double mitigation = physShare * 100.0 / (100.0 + armor) + (1.0 - physShare) * 100.0 / (100.0 + mr);
        incomingDps_ = std::max(0.0, rng_.normal(sc_.enemyDpsMean, sc_.enemyDpsSd)) * sc_.damageTakenFactor *
                       teamDamage * mitigation;
        engageAt_ = rng_.uniform(sc_.engageMin, sc_.engageMax);
        if (hasYuntal_) flurryUntil_ = yuntal_->param("flurry_duration", 6.0);
    }

    // --- time helpers -------------------------------------------------------

    double freeTime(double t) const {
        bool moved = true;
        while (moved) {
            moved = false;
            for (const auto& [a, b] : cc_)
                if (t >= a && t < b) { t = b; moved = true; }
        }
        return t;
    }

    bool qActive() const { return t_ < qActiveUntil_; }

    int ltStacks() const {
        return (hasSymphony_ && t_ - ltLast_ <= symphony_->param("lt_duration", 6.0)) ? ltStacks_ : 0;
    }
    int conqStacks() const {
        return (hasSymphony_ && t_ - conqLast_ <= symphony_->param("conq_duration", 5.0)) ? conqStacks_ : 0;
    }

    double currentAd() const {
        double ad = staticAd_;
        if (hasSymphony_) ad += conqStacks() * symphony_->param("conq_ad_per_stack", 4.0);
        return ad;
    }

    double bonusAs() const {
        double b = staticBonusAs_;
        if (qActive()) b += ch_.qActiveAs[ch_.qRank - 1];
        if (hasRageblade_) b += seething_ * rageblade_->param("seething_attack_speed", 0.08);
        if (hasSymphony_) b += ltStacks() * symphony_->param("lt_attack_speed_per_stack", 0.06);
        if (hasRhythm_ && t_ < rhythmUntil_) b += rhythmStacks_ * rhythm_->param("attack_speed_per_crit", 0.05);
        if (hasYuntal_ && t_ < flurryUntil_) b += yuntal_->param("flurry_attack_speed", 0.3);
        return b;
    }

    double attackSpeed() const {
        double cap = d_.rules.asCap;
        if (hasSymphony_ && ltStacks() >= static_cast<int>(symphony_->param("lt_max_stacks", 6)))
            cap = d_.rules.asCapLethalTempo;
        double as = ch_.baseAs + ch_.asRatio * bonusAs();
        if (hasDualWield_) as *= 1.0 + dualWield_->param("total_attack_speed", 0.25);
        return std::min(cap, as);
    }

    // --- damage -------------------------------------------------------------

    enum class Kind { Phys, Magic };

    Enemy* secondaryAlive(size_t i) {
        Enemy& e = secondaries_[i];
        if (!e.alive && t_ >= e.respawnAt) e = spawnEnemy();
        return e.alive ? &e : nullptr;
    }

    std::vector<Enemy*> aliveSecondaries() {
        std::vector<Enemy*> out;
        for (size_t i = 0; i < secondaries_.size(); ++i)
            if (Enemy* e = secondaryAlive(i)) out.push_back(e);
        return out;
    }

    void killPrimary() {
        ++res_.kills;
        // Retarget the nearest grouped enemy if one is up; otherwise wait for a new one.
        for (size_t i = 0; i < secondaries_.size(); ++i) {
            if (Enemy* e = secondaryAlive(i)) {
                primary_ = *e;
                e->alive = false;
                e->respawnAt = t_ + sc_.retargetDelay;
                return;
            }
        }
        primary_.alive = false;
        primaryRespawnAt_ = t_ + sc_.retargetDelay;
    }

    // Deals raw (pre-mitigation) damage; overkill is wasted.
    // Returns the damage actually dealt.
    double deal(Enemy* target, double raw, Kind kind, Source src) {
        if (!target || !target->alive || raw <= 0) return 0.0;
        double dmg = std::min(target->hp, raw * (kind == Kind::Phys ? target->physMult : target->magicMult));
        if (kind == Kind::Phys && bonus_.lifesteal > 0) heal(dmg * bonus_.lifesteal);
        target->hp -= dmg;
        res_.bySource[src] += dmg;
        res_.totalDamage += dmg;
        const bool isPrimary = target == &primary_;
        if (isPrimary) res_.primaryDamage += dmg;
        if (executeThreshold_ > 0 && target->hp > 0 && target->hp < executeThreshold_ * target->maxHp) {
            res_.bySource[src] += target->hp;
            res_.totalDamage += target->hp;
            if (isPrimary) res_.primaryDamage += target->hp;
            target->hp = 0;
        }
        if (target->hp <= 0) {
            if (isPrimary) {
                killPrimary();
            } else {
                ++res_.kills;
                target->alive = false;
                target->respawnAt = t_ + sc_.retargetDelay;
            }
        }
        return dmg;
    }

    void applyOnHit(Enemy* target, int times, double scale = 1.0) {
        const double qOnhit = ch_.qOnhit[ch_.qRank - 1] + ch_.qOnhitAp * ap_ +
                              (qActive() ? ch_.qActiveOnhit[ch_.qRank - 1] + ch_.qActiveOnhitAp * ap_ : 0.0);
        for (int i = 0; i < times; ++i) {
            deal(target, scale * qOnhit, Kind::Magic, SrcQOnhit);
            deal(target, scale * (bonus_.onhitMagic + bonus_.onhitMagicAp * ap_), Kind::Magic, SrcItemOnhit);
            deal(target, scale * bonus_.onhitPhys, Kind::Phys, SrcItemOnhit);
            if (bonus_.onhitCurHpPhys > 0 && target->alive)
                deal(target, scale * bonus_.onhitCurHpPhys * target->hp, Kind::Phys, SrcItemOnhit);
        }
    }

    // A crit-capable physical hit (attack, spread, bolt). Returns whether it crit.
    bool physicalHit(Enemy* target, double raw, Source src) {
        const bool crit = rng_.chance(crit_);
        const double dmg = raw * (crit ? critMult_ : 1.0);
        const double dealt = deal(target, dmg, Kind::Phys, src);
        if (crit && hasSoulSiphon_) heal(dealt * soulSiphon_->param("crit_heal", 0.12));
        if (crit) deal(target, dmg * (ch_.passiveRatio + ch_.passivePer100Ap * ap_ / 100.0), Kind::Magic, SrcPassive);
        return crit;
    }

    void basicAttack() {
        const double ad = currentAd();
        const bool crit = physicalHit(&primary_, ad, SrcAttack);

        int onhitTimes = 1 + ((crit && hasDoubleTap_) ? 1 : 0);
        if (hasRageblade_) {
            if (t_ - lastAttack_ > rageblade_->param("seething_duration", 4.0)) { seething_ = 0; phantomCount_ = 0; }
            if (seething_ < static_cast<int>(rageblade_->param("seething_max", 4))) {
                ++seething_;
            } else if (++phantomCount_ >= static_cast<int>(rageblade_->param("phantom_every", 3))) {
                ++onhitTimes;  // Phantom hit applies on-hit effects again
                phantomCount_ = 0;
            }
        }
        applyOnHit(&primary_, onhitTimes);

        if (hasKraken_ && ++krakenCount_ >= static_cast<int>(kraken_->param("every", 3))) {
            krakenCount_ = 0;
            const double missing = primary_.alive ? 1.0 - primary_.hp / primary_.maxHp : 0.0;
            deal(&primary_, kraken_->param("damage", 200) * (1.0 + kraken_->param("missing_hp_amp", 0.75) * missing),
                 Kind::Phys, SrcItemOnhit);
        }
        if (hasStorm_ && ++stormCount_ >= static_cast<int>(storm_->param("attacks_to_energize", 6))) {
            stormCount_ = 0;
            deal(&primary_, storm_->param("bolt_magic", 100), Kind::Magic, SrcItemOnhit);
        }

        auto group = aliveSecondaries();
        if (qActive())
            for (Enemy* e : group) physicalHit(e, ad * ch_.qSpreadAd, SrcQSpread);
        if (hasRunaan_) {
            const size_t bolts = std::min(group.size(), static_cast<size_t>(runaan_->param("bolts", 2)));
            for (size_t i = 0; i < bolts; ++i) {
                physicalHit(group[i], ad * runaan_->param("ad_ratio", 0.55), SrcExtraBolts);
                applyOnHit(group[i], 1);
            }
        }
        if (hasTyphoon_) {
            Enemy* target = group.empty() ? &primary_ : group[rng_.pick(group.size())];
            physicalHit(target, ad * typhoon_->param("ad_ratio", 0.5), SrcExtraBolts);
            applyOnHit(target, 1);
        }
        if (hasDualWield_ && ++dualWieldCount_ >= static_cast<int>(dualWield_->param("every", 2))) {
            // The bolt repeats part of this attack's damage (crit included) and on-hit at reduced strength.
            dualWieldCount_ = 0;
            const double ratio = dualWield_->param("repeat_ratio", 0.4);
            deal(&primary_, ad * (crit ? critMult_ : 1.0) * ratio, Kind::Phys, SrcExtraBolts);
            applyOnHit(&primary_, 1, dualWield_->param("onhit_effectiveness", 0.4));
        }
        if (hasCritMissile_ && crit) {
            const int missiles = static_cast<int>(critMissile_->param("missiles", 2));
            const double dmg = critMissile_->param("magic", 30) + critMissile_->param("bonus_ad_ratio", 0.15) * (ad - baseAd_);
            for (int i = 0; i < missiles; ++i) {
                Enemy* target = group.empty() ? &primary_ : group[rng_.pick(group.size())];
                deal(target, dmg, Kind::Magic, SrcExtraBolts);
            }
        }

        if (!qActive()) qStacks_ = std::min(ch_.qStacksNeeded, qStacks_ + 1);
        if (hasMysticPunch_) wReadyAt_ -= mystic_->param("cdr_per_hit", 1.5);
        if (hasSymphony_) {
            if (ltStacks() == 0) ltStacks_ = 0;
            ltStacks_ = std::min(static_cast<int>(symphony_->param("lt_max_stacks", 6)), ltStacks_ + 1);
            ltLast_ = t_;
            if (conqStacks() == 0) conqStacks_ = 0;
            conqStacks_ = std::min(static_cast<int>(symphony_->param("conq_max_stacks", 12)),
                                   conqStacks_ + static_cast<int>(symphony_->param("conq_stacks_per_attack", 1)));
            conqLast_ = t_;
        }
        if (hasRhythm_ && crit) {
            if (t_ >= rhythmUntil_) rhythmStacks_ = 0;
            rhythmStacks_ = std::min(static_cast<int>(rhythm_->param("max_stacks", 10)), rhythmStacks_ + 1);
            rhythmUntil_ = t_ + rhythm_->param("duration", 3.0);
        }
        lastAttack_ = t_;
    }

    double wCastTime() const {
        const double frac = std::clamp(bonusAs(), 0.0, 1.0);
        const double hi = rActive_ ? ch_.ruinCastMax : ch_.wCastMax;
        const double lo = rActive_ ? ch_.ruinCastMin : ch_.wCastMin;
        return hi - (hi - lo) * frac;
    }

    void castW() {
        double impact = ch_.wImpact[ch_.wRank - 1] + ch_.wAdRatio * currentAd() + ch_.wApRatio * ap_;
        if (rActive_) impact *= ch_.ruinDamageMult;
        if (rng_.chance(sc_.wHitChance)) {
            double hit = impact;
            if (hasGauntlet_ && rng_.chance(crit_)) {
                hit *= critMult_;
                deal(&primary_, hit * (ch_.passiveRatio + ch_.passivePer100Ap * ap_ / 100.0), Kind::Magic, SrcPassive);
            }
            deal(&primary_, hit, Kind::Magic, SrcW);
            deal(&primary_, impact * ch_.wLingerRatio, Kind::Magic, SrcW);
        }
        for (Enemy* e : aliveSecondaries())
            if (rng_.chance(ch_.wLingerSecondaryChance)) deal(e, impact * ch_.wLingerRatio, Kind::Magic, SrcW);
    }

    void refundW() {
        if (wReadyAt_ > t_) wReadyAt_ = t_ + (wReadyAt_ - t_) * (1.0 - ch_.rWRefund);
    }
};

TrialResult Fight::run() {
    res_.duration = duration_;
    while (true) {
        t_ = freeTime(t_);
        if (takeDamageUntil(std::min(t_, duration_))) break;
        if (t_ >= duration_) break;

        if (rActive_ && t_ >= rEnd_) { rActive_ = false; refundW(); }
        if (!rActive_ && rAvailable_) {
            rActive_ = true;
            rAvailable_ = false;
            rEnd_ = t_ + ch_.rDuration;
            refundW();
        }

        if (!primary_.alive) {
            t_ = std::max(t_, primaryRespawnAt_);
            primary_ = spawnEnemy();
            nextAttack_ = std::max(nextAttack_, t_);
            continue;
        }

        if (t_ >= wReadyAt_) {
            t_ += wCastTime();
            if (t_ >= duration_) break;
            castW();
            wReadyAt_ = t_ + ch_.wCooldown * (rActive_ ? ch_.ruinCooldownMult : 1.0);
            nextAttack_ = std::max(nextAttack_, t_);
            continue;
        }

        if (qStacks_ >= ch_.qStacksNeeded && !qActive()) {
            qActiveUntil_ = t_ + ch_.qActiveDuration;
            qStacks_ = 0;
            nextAttack_ = t_;  // Q activation resets the attack timer
        }

        if (nextAttack_ > t_) {
            double nt = std::min(nextAttack_, wReadyAt_);
            if (rActive_) nt = std::min(nt, rEnd_);
            t_ = std::max(nt, t_ + 1e-9);
            continue;
        }

        basicAttack();
        const double interval = 1.0 / attackSpeed();
        nextAttack_ = t_ + interval;
        if (rActive_ && t_ >= eReadyAt_ && ch_.eDashTime < interval) {
            nextAttack_ = t_ + ch_.eDashTime;  // E dash resets the attack timer during R
            eReadyAt_ = t_ + ch_.eCooldown;
        }
    }
    if (!dead_) {
        takeDamageUntil(duration_);
        if (!dead_) res_.timeAlive = duration_;
    }
    return res_;
}

}  // namespace

std::vector<TrialResult> runTrials(const GameData& data, const Build& build, const Scenario& sc,
                                   uint64_t firstTrial, int count) {
    data.validate(build);
    std::vector<TrialResult> out;
    out.reserve(static_cast<size_t>(std::max(0, count)));
    for (int i = 0; i < count; ++i) out.push_back(Fight(data, build, sc, firstTrial + static_cast<uint64_t>(i)).run());
    return out;
}

Summary summarize(const std::vector<TrialResult>& results) {
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
    if (total > 0)
        for (auto& x : s.shareBySource) x /= total;
    return s;
}

}  // namespace yunara
