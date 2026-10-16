#!/usr/bin/env python3
"""Build data/champions.json: every champion's stats and ability damage for the
all-champion ARAM Mayhem simulator.

Sources (all fetched live, then cached):
  - Riot Data Dragon: champion list and base stats.
  - CommunityDragon: each champion's game data (ability values, scalings,
    cooldowns, targeting) and the English string table (tooltips, which say
    whether a number is magic, physical or true damage).
  - aramnerfs.com/mayhem: ARAM Mayhem per-champion damage dealt/taken and
    other balance changes.
  - simulator/data/cn_enemy_pool.json (built by build_enemy_pool.py): role,
    CC rating and China-server Mayhem damage shares, used to check results.

The ability parser is generic. It reads each ability's tooltip, finds every
number tagged as magic, physical or true damage, and evaluates the game's own
formula for it at level 18 with max ranks (R rank 3, others rank 5). That gets
most damage abilities right but not every special case (stacking passives,
empowered recasts, on-hit steroids, transformations). Each champion carries a
`parse_quality` and notes; data/champion_overrides.json fixes the ones that
matter most by hand.

    python3 simulator/tools/build_champion_pool.py
    python3 simulator/tools/build_champion_pool.py --only Ahri,Lux

Python 3 standard library only.
"""

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
DEFAULT_OUT = os.path.join(DATA, "champions.json")
DEFAULT_POOL = os.path.join(DATA, "cn_enemy_pool.json")
DEFAULT_CACHE = os.path.join(os.path.expanduser("~"), ".cache", "aram-mayhem-sim")

DDRAGON = "https://ddragon.leagueoflegends.com"
CDRAGON = "https://raw.communitydragon.org/latest"
STRINGTABLE = CDRAGON + "/game/en_us/data/menu/en_us/lol.stringtable.json"
CHAMP_BIN = CDRAGON + "/game/data/characters/{c}/{c}.bin.json"
MAYHEM_BALANCE = "https://www.aramnerfs.com/mayhem"

LEVEL = 18
RANKS = {"Q": 5, "W": 5, "E": 5, "R": 3}
DEFAULT_COOLDOWN, DEFAULT_R_COOLDOWN = 8.0, 90.0
DEFAULT_OVERRIDES = os.path.join(DATA, "champion_overrides.json")
DEFAULT_ANIMS = os.path.join(HERE, "..", "viewer", "replay-data", "anims.json")
YUNARA_ID = 804

# Stat ids used by the game's ability formulas (mStat). Inferred from how
# abilities use them (e.g. 12 is max health on Braum Q, 29 lethality on Pyke R).
STAT = {0: "ap", 1: "armor", 2: "ad", 4: "as", 6: "mr", 8: "crit", 12: "hp", 29: "lethality"}
# mStatFormula: missing = total, 1 = base, 2 = bonus.

AOE_TARGETING = {"Area", "AreaClamped", "SelfAoe", "Cone", "Location", "LocationClamped", "TargetOrLocation", "Self"}
LINE_TARGETING = {"Direction", "DragDirection"}

# Words right before a damage number that mark it as an alternative to the
# main hit (an empowered or maximum version) rather than extra damage.
ALT_WORDS = ("up to", "increased to", "instead", "empowered", "maximum of", "minimum of", "at most")
# Formula names that are never champion damage.
SKIP_CALC = re.compile(r"minion|monster|structure|turret|tower|heal|shield", re.I)
# Mode layers in Riot's DataValuesModeOverride, applied in order.
MODE_LAYERS = ("ARAM", "Kiwi")


def log(*a):
    print(*a, file=sys.stderr)


def fetch(url, cache_dir, name=None, tries=5):
    path = os.path.join(cache_dir, name) if name else None
    if path and os.path.exists(path) and os.path.getsize(path) > 0:
        with open(path, encoding="utf-8") as f:
            return f.read()
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "aram-mayhem-sim"})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8")
            break
        except Exception as e:  # connection resets happen; retry with backoff
            if i == tries - 1:
                raise RuntimeError(f"failed to fetch {url}: {e}") from e
            time.sleep(2 ** i)
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    return body


def level_stat(base, per_level, level=LEVEL):
    n = level - 1
    return base + per_level * n * (0.7025 + 0.0175 * n)


# ---------------------------------------------------------------------------
# Formula evaluation: every part becomes a linear form {stat key: coefficient}
# with "const" for the flat part, at a fixed rank and champion level.
# ---------------------------------------------------------------------------

class Lin(dict):
    def __add__(self, o):
        r = Lin(self)
        for k, v in o.items():
            r[k] = r.get(k, 0.0) + v
        return r

    def scale(self, s):
        return Lin({k: v * s for k, v in self.items()})

    def const(self):
        return self.get("const", 0.0)

    def is_const(self):
        return all(k == "const" or abs(v) < 1e-12 for k, v in self.items())


class Evaluator:
    def __init__(self, spell, rank, base_stats, notes):
        self.spell = spell
        self.rank = rank
        self.base = base_stats  # level-18 base values: ad, hp, armor, mr
        self.notes = notes
        self.values = {}
        self.mode_overrides = []

        def load(dvs, mode=None):
            for dv in dvs or []:
                name = dv.get("name") or dv.get("mName")
                vals = dv.get("values") or dv.get("mValues") or []
                if name and vals:
                    if mode and self.values.get(name.lower()) != vals:
                        self.mode_overrides.append(f"{mode}:{name}")
                    self.values[name.lower()] = vals

        load(spell.get("DataValues"))
        # Riot's own per-mode ability values: regular ARAM first, then Mayhem (Kiwi) on top.
        overrides = spell.get("DataValuesModeOverride") or {}
        for mode in MODE_LAYERS:
            load((overrides.get(mode) or {}).get("SpellDataValues"), mode)
        self.calcs = {k: v for k, v in (spell.get("mSpellCalculations") or {}).items()}
        self.calcs_lower = {k.lower(): v for k, v in self.calcs.items()}
        self.depth = 0

    def dv(self, name):
        vals = self.values.get((name or "").lower())
        if not vals:
            self.notes.add(f"missing value {name}")
            return 0.0
        return float(vals[min(self.rank, len(vals) - 1)])

    def stat(self, stat_id, formula, coef):
        key = STAT.get(stat_id)
        if key is None:
            self.notes.add(f"unsupported stat {stat_id}")
            return Lin()
        if key in ("as", "crit", "lethality"):
            return Lin({key: coef})
        if formula == 1:  # base only
            return Lin({"const": coef * self.base.get(key, 0.0)})
        if formula == 2:  # bonus only
            return Lin({"bonus_" + key if key != "ap" else "ap": coef})
        if key == "ap":
            return Lin({"ap": coef})
        return Lin({"const": coef * self.base.get(key, 0.0), "bonus_" + key: coef})

    def part(self, p):
        t = p.get("__type")
        if t == "NamedDataValueCalculationPart":
            return Lin({"const": self.dv(p.get("mDataValue"))})
        if t == "NumberCalculationPart":
            return Lin({"const": float(p.get("mNumber", 0.0))})
        if t == "StatByCoefficientCalculationPart":
            return self.stat(p.get("mStat", 0), p.get("mStatFormula", 0), float(p.get("mCoefficient", 0.0)))
        if t == "StatByNamedDataValueCalculationPart":
            return self.stat(p.get("mStat", 0), p.get("mStatFormula", 0), self.dv(p.get("mDataValue")))
        if t == "StatBySubPartCalculationPart":
            sub = self.part(p.get("mSubpart") or {})
            return self.stat(p.get("mStat", 0), p.get("mStatFormula", 0), sub.const())
        if t == "EffectValueCalculationPart":
            idx = int(p.get("mEffectIndex", 1)) - 1
            eff = self.spell.get("mEffectAmount") or []
            if 0 <= idx < len(eff):
                vals = eff[idx].get("value") or []
                if vals:
                    return Lin({"const": float(vals[min(self.rank, len(vals) - 1)])})
            return Lin()
        if t == "ByCharLevelInterpolationCalculationPart":
            a, b = float(p.get("mStartValue", 0.0)), float(p.get("mEndValue", 0.0))
            return Lin({"const": b if LEVEL >= 18 else a + (b - a) * (LEVEL - 1) / 17})
        if t == "ByCharLevelBreakpointsCalculationPart":
            v = float(p.get("mLevel1Value", 0.0))
            per = float(p.get("{02deb550}", p.get("mInitialBonusPerLevel", 0.0)) or 0.0)
            bps = sorted(p.get("mBreakpoints") or [], key=lambda b: b.get("mLevel", 0))
            for lvl in range(2, LEVEL + 1):
                for b in bps:
                    if b.get("mLevel") == lvl:
                        v += float(b.get("mAdditionalBonusAtThisLevel", 0.0))
                        if "mBonusPerLevelAtAndAfter" in b:
                            per = float(b["mBonusPerLevelAtAndAfter"])
                v += per
            return Lin({"const": v})
        if t == "ByCharLevelFormulaCalculationPart":
            vals = p.get("values") or [0.0]
            return Lin({"const": float(vals[min(LEVEL - 1, len(vals) - 1)])})
        if t == "SumOfSubPartsCalculationPart":
            r = Lin()
            for s in p.get("mSubparts") or []:
                r = r + self.part(s)
            return r
        if t == "ProductOfSubPartsCalculationPart":
            a, b = self.part(p.get("mPart1") or {}), self.part(p.get("mPart2") or {})
            if a.is_const():
                return b.scale(a.const())
            if b.is_const():
                return a.scale(b.const())
            self.notes.add("product of two scalings simplified")
            return Lin({"const": a.const() * b.const()})
        if t == "ClampSubPartsCalculationPart":
            r = Lin()
            for s in p.get("mSubparts") or []:
                r = r + self.part(s)
            if r.is_const():
                c = min(max(r.const(), float(p.get("mFloor", -1e9))), float(p.get("mCeiling", 1e9)))
                return Lin({"const": c})
            return r
        if t in ("BuffCounterByNamedDataValueCalculationPart", "BuffCounterByCoefficientCalculationPart"):
            self.notes.add("stack-based scaling ignored")
            return Lin()
        if t == "CooldownMultiplierCalculationPart":
            return Lin({"const": 1.0})
        if t == "AbilityResourceByCoefficientCalculationPart":
            self.notes.add("mana scaling ignored")
            return Lin()
        if t:
            self.notes.add(f"unsupported part {t}")
        return Lin()

    def calc(self, name):
        c = self.calcs.get(name) or self.calcs_lower.get((name or "").lower())
        if c is None:
            vals = self.values.get((name or "").lower())
            if vals:
                return Lin({"const": float(vals[min(self.rank, len(vals) - 1)])}), False
            return None, False
        if self.depth > 8:
            return None, False
        self.depth += 1
        try:
            t = c.get("__type")
            if t == "GameCalculationModified":
                base, pct = self.calc(c.get("mModifiedGameCalculation"))
                if base is None:
                    return None, False
                mult = self.part(c.get("mMultiplier") or {"__type": "NumberCalculationPart", "mNumber": 1.0})
                return base.scale(mult.const() if mult.is_const() else 1.0), pct
            if t == "GameCalculationConditional":
                return self.calc(c.get("mDefaultGameCalculation"))
            r = Lin()
            for p in c.get("mFormulaParts") or []:
                r = r + self.part(p)
            if c.get("mMultiplier"):
                m = self.part(c["mMultiplier"])
                if m.is_const():
                    r = r.scale(m.const())
            return r, bool(c.get("mDisplayAsPercent"))
        finally:
            self.depth -= 1


# ---------------------------------------------------------------------------
# Tooltips: which formulas are damage, and of which type.
# ---------------------------------------------------------------------------

DAMAGE_TAG = re.compile(r"<(magicDamage|physicalDamage|trueDamage)>(.*?)</\1>", re.S | re.I)
REF = re.compile(r"@([A-Za-z0-9_.{}]+?)(?:\*(-?[0-9.]+))?@")
TYPE = {"magicdamage": "magic", "physicaldamage": "physical", "truedamage": "true"}


def clean(text):
    text = re.sub(r"<br>", " ", text or "", flags=re.I)
    return html.unescape(re.sub(r"\s+", " ", text))


def tooltip_for(spell, strings):
    keys = (((spell.get("mClientData") or {}).get("mTooltipData") or {}).get("mLocKeys") or {})
    for k in ("keyTooltip", "keyTooltipSimple"):
        key = keys.get(k)
        if key and key.lower() in strings:
            return strings[key.lower()]
    return ""


def resolve_includes(text, strings, depth=0):
    if depth > 3:
        return text
    return re.sub(r"\{\{\s*([A-Za-z0-9_]+)\s*\}\}",
                  lambda m: resolve_includes(strings.get(m.group(1).lower(), ""), strings, depth + 1), text)


def flat_is_range(inner, refs, i):
    """True when ref i is the upper end of an "X to Y" range."""
    return i > 0 and bool(re.search(r"\bto\s*$|-\s*$", inner[refs[i - 1].end():refs[i].start()].lower()))


def round_lin(lin):
    return {k: round(v, 4) for k, v in lin.items() if abs(v) > 1e-9}


def parse_spell(slot, spell_obj, strings, base_stats, attack_range=125):
    spell = spell_obj.get("mSpell") or {}
    rank = RANKS[slot]
    notes = set()
    ev = Evaluator(spell, rank, base_stats, notes)
    text = clean(resolve_includes(tooltip_for(spell, strings), strings))
    main = re.search(r"<mainText>(.*?)</mainText>", text, re.S)
    body = main.group(1) if main else text

    hits = []
    for m in DAMAGE_TAG.finditer(body):
        kind, inner = TYPE[m.group(1).lower()], m.group(2)
        before = body[max(0, m.start() - 30):m.start()].lower()
        after = body[m.end():m.end() + 30].lower()
        flat, flat_names, health = [], [], []
        refs = list(REF.finditer(inner))
        for i, ref in enumerate(refs):
            name, mult = ref.group(1), ref.group(2)
            if SKIP_CALC.search(name):
                continue
            lin, is_pct = ev.calc(name)
            if lin is None:
                continue
            nxt = refs[i + 1].start() if i + 1 < len(refs) else len(inner)
            tail = inner[ref.end():nxt].lower()
            words = (tail + " " + (after if i + 1 == len(refs) else "")).lower()
            health_part = "health" in words[:25] and not flat_is_range(inner, refs, i)
            if tail.startswith("%") or is_pct or (flat and health_part):
                # A percent: target health damage if the text says so, else a ratio display.
                if "health" not in words:
                    continue
                target = ("target_missing_hp" if "missing" in words else
                          "target_current_hp" if "current" in words else "target_max_hp")
                if mult:
                    lin = lin.scale(float(mult) / 100.0)  # "@X*100@%" shows a fraction as a percent
                elif lin.const() > 1.0 or tail.startswith("%"):
                    lin = lin.scale(0.01)
                health.append((target, lin, name))
            else:
                if mult and float(mult) not in (100.0, 1.0):
                    lin = lin.scale(float(mult))  # e.g. "@BaseDamage*0.5@"
                ranged = bool(flat) and re.search(r"\bto\s*$|-\s*$", inner[refs[i - 1].end():ref.start()].lower())
                if ranged:  # "X to Y": use the middle of the range
                    flat[-1] = (flat[-1] + lin).scale(0.5)
                    flat_names[-1] += "~" + name
                elif not flat:
                    flat.append(lin)
                    flat_names.append(name)
        # "... damage @NumberOfStrikes@ times": a multi-hit count.
        count = 1.0
        cm = re.match(r"\s*(?:@([A-Za-z0-9_]+)@|([0-9]+))\s*times", body[m.end():m.end() + 40])
        if cm:
            if cm.group(2):
                count = float(cm.group(2))
            else:
                c_lin, _ = ev.calc(cm.group(1))
                if c_lin is None or c_lin.const() <= 0:
                    for cname in list(ev.calcs) + list(ev.values):
                        if re.search(r"strikes|hits|ticks|times|count", cname, re.I):
                            c_lin, _ = ev.calc(cname)
                            if c_lin is not None and c_lin.const() > 0:
                                break
                if c_lin is not None and c_lin.const() > 0:
                    count = c_lin.const()
            if count > 1:
                flat = [f.scale(count) for f in flat]
                health = [(t, l.scale(count), n) for t, l, n in health]
                notes.add(f"multi-hit x{count:g}")
        if not flat and not health:
            continue
        inner_l = inner.lower()
        per_second = "per second" in inner_l or "per second" in after or "every second" in after
        alt = any(w in before for w in ALT_WORDS)
        if flat:
            hits.append({"type": kind, "calc": flat_names[0], "scaling": round_lin(flat[0]), "target": "flat",
                         "per_second": per_second, "alt": alt})
        for target, lin, name in health:
            hits.append({"type": kind, "calc": name, "scaling": round_lin(lin), "target": target,
                         "per_second": per_second, "alt": alt})

    cooldown = spell.get("cooldownTime") or [0.0] * 7
    cd = float(cooldown[min(rank, len(cooldown) - 1)])
    recharge = spell.get("mAmmoRechargeTime") or []
    if recharge and float(recharge[min(rank, len(recharge) - 1)]) > cd:
        # Ammo abilities: sustained use is one cast per recharge.
        cd = float(recharge[min(rank, len(recharge) - 1)])
        notes.add("cooldown is the ammo recharge time")
    durations = [v for k, v in ev.values.items() if "duration" in k and v]
    duration = float(durations[0][min(rank, len(durations[0]) - 1)]) if durations else 0.0
    targeting = (spell.get("mTargetingTypeData") or {}).get("__type", "")
    area = "aoe" if targeting in AOE_TARGETING else "line" if targeting in LINE_TARGETING else "single"
    return {
        "slot": slot,
        "name": spell_obj.get("mScriptName", ""),
        "rank": rank,
        "cooldown": round(cd, 3),
        "cast_time": round(float(spell.get("mCastTime", 0.25) or 0.25), 3),
        "targeting": targeting,
        "area": area,
        "duration": round(duration, 3),
        "geometry": parse_geometry(spell, slot, area, attack_range),
        "hits": hits,
        "mode_overrides": ev.mode_overrides,
        "notes": sorted(notes),
    }


def per_level(v, rank):
    """A FloatPerSpellLevel or plain number at this rank (lists start at rank 0)."""
    if isinstance(v, dict):
        vals = v.get("mPerLevelValues")
        return float(vals[min(rank, len(vals) - 1)]) if vals else None
    if isinstance(v, list):
        return float(v[min(rank, len(v) - 1)]) if v else None
    if isinstance(v, (int, float)):
        return float(v)
    return None


SELF_TARGETING = {"Self", "SelfAoe"}
FAKE_RANGE = 5000  # castRange 25000 (or 10000) means "aimed anywhere"; the targeter has the real range


def parse_geometry(spell, slot, area, attack_range):
    """Where an ability reaches and what it covers, in game units, from the targeter
    the game draws when aiming it (mTargeterDefinitions), falling back to the spell's
    own cast range, radius and line width. Missile speed 0 means it lands at once."""
    rank = RANKS[slot]
    targeting = (spell.get("mTargetingTypeData") or {}).get("__type", "")
    targeters = ((spell.get("mClientData") or {}).get("mTargeterDefinitions")) or []
    by_type = {}
    for t in targeters:
        by_type.setdefault(t.get("__type", ""), t)
    line, aoe, cone = by_type.get("TargeterDefinitionLine"), by_type.get("TargeterDefinitionAoe"), by_type.get("TargeterDefinitionCone")
    rng = by_type.get("TargeterDefinitionRange")
    arc = by_type.get("TargeterDefinitionArc")
    missile = (spell.get("mMissileSpec") or {})
    speed = per_level((missile.get("movementComponent") or {}).get("mSpeed"), rank) or 0.0
    if speed < 300:
        speed = per_level(spell.get("missileSpeed"), rank) or 0.0
    if speed < 300 or speed > 6000:
        speed = 0.0
    cast_range = per_level(spell.get("castRangeDisplayOverride"), rank) or per_level(spell.get("castRange"), rank) or 0.0
    anywhere = cast_range >= FAKE_RANGE
    if anywhere:
        cast_range = 0.0

    g = {"shape": "single", "range": 0.0, "radius": 0.0, "width": 0.0, "angle": 0.0, "speed": round(speed),
         "on_self": targeting in SELF_TARGETING}
    if cone:
        g.update(shape="cone", range=per_level(cone.get("coneRange"), rank) or cast_range,
                 angle=per_level(cone.get("coneAngleDegrees"), rank) or 45.0)
    elif line and area == "line" or line and not aoe:
        width = per_level(line.get("lineWidth"), rank) or per_level(spell.get("mLineWidth"), rank) or \
            per_level(missile.get("mMissileWidth"), rank) or 80.0
        g.update(shape="line", range=per_level(line.get("overrideBaseRange"), rank) or cast_range, width=width)
    elif aoe or arc or area == "aoe":
        t = aoe or arc or {}
        radius = per_level(t.get("overrideRadius"), rank) or per_level(spell.get("castRadius"), rank) or 0.0
        reach = per_level(t.get("constraintRange"), rank) or cast_range
        if g["on_self"]:
            radius = radius or reach
            reach = 0.0
        if g["on_self"] and radius < 150:
            # No real area (a placeholder castRadius): a self buff whose damage lands
            # through the champion's attacks, so it reaches whatever they can attack.
            g.update(shape="single", range=float(attack_range), self_buff=True)
        else:
            g.update(shape="circle", range=reach, radius=radius or 300.0)
    if rng and per_level(rng.get("overrideBaseRange"), rank):
        g["range"] = max(g["range"], per_level(rng.get("overrideBaseRange"), rank))
    if g["shape"] == "single" and g["on_self"]:
        g.update(range=float(attack_range), self_buff=True)
    elif g["shape"] == "single":
        g["range"] = cast_range if 0 < cast_range < FAKE_RANGE else 0.0
    if not g["range"] and not (g["on_self"] and g["shape"] in ("circle", "single")):
        # Nothing usable: melee-ish abilities reach a little past the attack, others a typical cast range.
        if anywhere and g["shape"] in ("line", "circle"):
            g["range"] = 1500.0 if g["shape"] == "line" else 900.0  # long-range or global: far, but fought nearby
        else:
            g["range"] = max(attack_range + 100, 600.0) if g["shape"] != "single" or attack_range >= 300 else attack_range + 50
        g["range_guessed"] = True
    if g["on_self"]:
        g["speed"] = 0
    for k in ("range", "radius", "width", "angle"):
        g[k] = round(float(g[k]), 1)
    return g


def find_spell(bin_data, path):
    if path in bin_data:
        return bin_data[path]
    low = path.lower()
    for k, v in bin_data.items():
        if k.lower() == low:
            return v
    tail = path.split("/")[-1].lower()
    for k, v in bin_data.items():
        if isinstance(v, dict) and v.get("__type") == "SpellObject" and k.lower().endswith("/" + tail):
            return v
    return None


# ---------------------------------------------------------------------------
# ARAM Mayhem balance table
# ---------------------------------------------------------------------------

def parse_mayhem_balance(page):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    t = re.sub(r"<[^>]+>", "|", t)
    t = html.unescape(re.sub(r"(\s*\|\s*)+", "|", t))
    patch = re.search(r"Patch\|([0-9.]+)\|", t)
    out = {}
    starts = list(re.finditer(r"(?<=\|)([^|]+)\|Dmg Dealt\|([^|]+)\|Dmg Taken\|([^|]+)\|", t))
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(t)
        rest = t[m.end():end].strip("|")
        pctv = lambda s: float(s.replace("%", "").replace("+", "")) / 100.0 if re.match(r"^[+-]?[0-9.]+%$", s) else 0.0
        entry = {"damage_dealt": round(1 + pctv(m.group(2)), 4), "damage_taken": round(1 + pctv(m.group(3)), 4),
                 "ability_haste": 0.0, "attack_speed": 0.0, "cooldowns": {}, "changes": rest}
        ah = re.search(r"Ability haste (increased|reduced) by ([0-9.]+)", rest)
        if ah:
            entry["ability_haste"] = float(ah.group(2)) * (1 if ah.group(1) == "increased" else -1)
        asp = re.search(r"Total attack speed (increased|reduced) by ([0-9.]+)%", rest)
        if asp:
            entry["attack_speed"] = float(asp.group(2)) / 100 * (1 if asp.group(1) == "increased" else -1)
        for cm in re.finditer(r"(?:^|\|)([QWER])\|Cooldown\|[^|]+\|→\|([0-9.]+)(?:-([0-9.]+))?s", rest):
            entry["cooldowns"][cm.group(1)] = [float(cm.group(2)), float(cm.group(3) or cm.group(2))]
        out[norm(m.group(1))] = entry
    return out, (patch.group(1) if patch else "")


def norm(name):
    return re.sub(r"[^a-z]", "", name.lower())


def rank_cooldown(lo_hi, slot):
    lo, hi = lo_hi
    ranks = 3 if slot == "R" else 5
    # "20-14s": first value is rank 1, second is max rank.
    return hi if ranks > 1 else lo


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--pool", default=DEFAULT_POOL, help="cn_enemy_pool.json for roles and CN stats")
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--only", default="", help="comma-separated champion names (for debugging)")
    ap.add_argument("--overrides", default=DEFAULT_OVERRIDES, help="hand fixes per champion and ability")
    ap.add_argument("--anims", default=DEFAULT_ANIMS, help="anims.json with which abilities dash or blink")
    args = ap.parse_args()
    cache = args.cache

    version = json.loads(fetch(DDRAGON + "/api/versions.json", cache))[0]
    champs = json.loads(fetch(f"{DDRAGON}/cdn/{version}/data/en_US/champion.json", cache, f"champion-{version}.json"))["data"]
    log(f"Data Dragon {version}: {len(champs)} champions")
    strings = {k.lower(): v for k, v in json.loads(fetch(STRINGTABLE, cache, "stringtable.json"))["entries"].items()}
    balance, balance_patch = parse_mayhem_balance(fetch(MAYHEM_BALANCE, cache, "mayhem-balance.html"))
    log(f"Mayhem balance table (patch {balance_patch}): {len(balance)} champions")

    with open(args.pool, encoding="utf-8") as f:
        pool = json.load(f)
    with open(args.overrides, encoding="utf-8") as f:
        overrides = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    cn = {int(e["champion_id"]): e for e in pool["enemies"]}
    anims = {}
    if os.path.exists(args.anims):
        with open(args.anims, encoding="utf-8") as f:
            anims = json.load(f)

    only = {norm(x) for x in args.only.split(",") if x}
    todo = [c for c in champs.values() if not only or norm(c["id"]) in only or norm(c["name"]) in only]

    def load(c):
        return c, json.loads(fetch(CHAMP_BIN.format(c=c["id"].lower()), cache, f"bins/{c['id'].lower()}.json"))

    with ThreadPoolExecutor(8) as ex:
        loaded = list(ex.map(load, todo))

    out = []
    for c, bin_data in sorted(loaded, key=lambda x: x[0]["name"]):
        cid = int(c["key"])
        s = c["stats"]
        base = {
            "ad": level_stat(s["attackdamage"], s["attackdamageperlevel"]),
            "hp": level_stat(s["hp"], s["hpperlevel"]),
            "armor": level_stat(s["armor"], s["armorperlevel"]),
            "mr": level_stat(s["spellblock"], s["spellblockperlevel"]),
        }
        record = next((v for k, v in bin_data.items() if isinstance(v, dict) and v.get("__type") == "CharacterRecord"
                       and k.lower().endswith("/root")), {})
        spell_paths = record.get("spells") or []
        abilities, notes = [], []
        for slot, path in zip("QWER", spell_paths):
            obj = find_spell(bin_data, path)
            if obj is None:
                notes.append(f"{slot}: spell data not found")
                continue
            abilities.append(parse_spell(slot, obj, strings, base, s["attackrange"]))
        if any(a["cooldown"] <= 0 for a in abilities):
            # A few abilities keep their cooldown outside the spell record; Data Dragon has it.
            detail = json.loads(fetch(f"{DDRAGON}/cdn/{version}/data/en_US/champion/{c['id']}.json", cache,
                                      f"ddragon/{version}/{c['id']}.json"))["data"][c["id"]]["spells"]
            for a, sp in zip(abilities, detail):
                if a["cooldown"] <= 0 and sp.get("cooldown"):
                    a["cooldown"] = float(sp["cooldown"][min(a["rank"], len(sp["cooldown"])) - 1])
                    a["notes"].append("cooldown from Data Dragon")

        for a in abilities:
            if a["cooldown"] < 1.0 and not (a["hits"] and all(h["per_second"] for h in a["hits"])):
                # Passives, resource-gated and charge abilities keep no usable cooldown.
                a["cooldown"] = DEFAULT_R_COOLDOWN if a["slot"] == "R" else DEFAULT_COOLDOWN
                a["notes"].append(f"cooldown unknown; assumed {a['cooldown']:g}s")
        for slot, fix in overrides.get(c["id"], {}).items():
            for a in abilities:
                if a["slot"] == slot:
                    for k, v in fix.items():
                        if k == "geometry":
                            a["geometry"].update(v)
                        elif k != "why":
                            a[k] = v
                    a["notes"].append("hand override: " + fix.get("why", ""))
        abilities = [a for a in abilities if not a.get("skip")]
        for a in abilities:
            move = (anims.get(c["id"], {}).get(a["slot"]) or {}).get("move")
            if move and "move" not in a["geometry"]:
                a["geometry"]["move"] = move  # "dash" or "blink": the caster travels with the ability

        bal = balance.get(norm(c["name"])) or balance.get(norm(c["id"]))
        if bal:
            for slot, lohi in bal["cooldowns"].items():
                for a in abilities:
                    if a["slot"] == slot:
                        a["cooldown"] = rank_cooldown(lohi, slot)
                        a["notes"].append("cooldown from Mayhem balance table")
        else:
            notes.append("not in the Mayhem balance table; no modifiers applied")

        damaging = sum(1 for a in abilities if a["hits"])
        flagged = sum(1 for a in abilities for n in a["notes"] if "ignored" in n or "unsupported" in n)
        quality = "good" if damaging >= 2 and flagged == 0 else "partial" if damaging >= 1 else "none"
        p = cn.get(cid)
        entry = {
            "id": c["id"],
            "name": c["name"],
            "champion_id": cid,
            "tags": c.get("tags", []),
            "role": (p or {}).get("role") or (c.get("tags") or ["Fighter"])[0].lower(),
            "ranged": s["attackrange"] >= 300,
            "stats": {
                "hp": s["hp"], "hp_per_level": s["hpperlevel"],
                "armor": s["armor"], "armor_per_level": s["armorperlevel"],
                "mr": s["spellblock"], "mr_per_level": s["spellblockperlevel"],
                "ad": s["attackdamage"], "ad_per_level": s["attackdamageperlevel"],
                "attack_speed": s["attackspeed"], "attack_speed_per_level": s["attackspeedperlevel"] / 100.0,
                "attack_speed_ratio": round(float((record.get("attackSpeedRatioModifiable") or {}).get("baseValue")
                                                  or s["attackspeed"]), 4),
                "attack_range": s["attackrange"],
                "move_speed": s["movespeed"],
            },
            "mayhem": {
                "damage_dealt": (bal or {}).get("damage_dealt", 1.0),
                "damage_taken": (bal or {}).get("damage_taken", 1.0),
                "ability_haste": (bal or {}).get("ability_haste", 0.0),
                "attack_speed": (bal or {}).get("attack_speed", 0.0),
                "changes": (bal or {}).get("changes", ""),
            },
            "cn": {k: p[k] for k in ("weight", "damage_share", "damage_taken_share", "win_rate", "cc", "phys_share")} if p else None,
            "abilities": abilities,
            "parse_quality": quality,
            "notes": notes,
        }
        out.append(entry)

    if YUNARA_ID not in cn and pool.get("yunara"):
        for e in out:
            if e["champion_id"] == YUNARA_ID:
                y = pool["yunara"]
                e["cn"] = {"weight": y.get("pick_rate"), "damage_share": y.get("damage_share"),
                           "damage_taken_share": y.get("damage_taken_share"), "win_rate": y.get("win_rate"),
                           "cc": 1, "phys_share": 1.0}

    doc = {
        "meta": {
            "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "ddragon_version": version,
            "cdragon": "latest",
            "mayhem_balance_patch": balance_patch,
            "level": LEVEL,
            "ranks": RANKS,
            "notes": [
                "Ability damage is parsed from Riot's game data (CommunityDragon) and tooltips: every number tagged as "
                "magic, physical or true damage, evaluated at level 18 with max ranks. scaling keys: const, ap, bonus_ad, "
                "bonus_hp, bonus_armor, bonus_mr, as (bonus attack speed), crit, lethality.",
                "target is flat or a fraction of the target's max/current/missing health. alt marks numbers that look like "
                "alternatives (empowered, maximum, recast) rather than extra hits.",
                "mayhem holds the ARAM Mayhem damage dealt/taken modifiers and listed changes (aramnerfs.com).",
                "cn holds 101.qq.com China-server Mayhem stats: damage_share is the average share of the team's damage.",
            ],
        },
        "champions": out,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    q = {k: sum(1 for e in out if e["parse_quality"] == k) for k in ("good", "partial", "none")}
    log(f"wrote {len(out)} champions to {os.path.relpath(args.out)} (parse quality {q})")


if __name__ == "__main__":
    main()
