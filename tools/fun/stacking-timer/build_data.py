"""Build data.js for the Stacking timer from CommunityDragon.

Usage: python3 build_data.py [--channel latest|pbe]
Writes data.js next to this script. Python 3 standard library only.
"""
import argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from cdragon import Game, get, write_data_js  # noqa: E402


def spell_values(bin_, alias, spell):
    """A spell's data values at ranks 1-5, with ARAM then Mayhem (Kiwi) overrides applied."""
    key = next(k for k in bin_ if k.startswith(f"Characters/{alias}/Spells/") and k.endswith(f"/{spell}"))
    sp = bin_[key]["mSpell"]
    dv = {d["name"]: d.get("values", [0] * 7)[1:6] for d in sp.get("DataValues", [])}
    for mode in ("ARAM", "Kiwi"):
        for d in (sp.get("DataValuesModeOverride") or {}).get(mode, {}).get("SpellDataValues", []):
            dv[d["name"]] = d["values"][1:6]
    return dv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default="latest")
    g = Game(ap.parse_args().channel)
    summary = {c["alias"]: c for c in get(f"{g.gd}/champion-summary.json")}

    def champ(alias):
        return {"alias": alias, "name": summary[alias]["name"], "icon": g.champion_icon(summary[alias]["id"])}

    vp = spell_values(g.champion_bin("Veigar"), "Veigar", "VeigarPassive")
    vq = spell_values(g.champion_bin("Veigar"), "Veigar", "VeigarBalefulStrike")
    nq = spell_values(g.champion_bin("Nasus"), "Nasus", "NasusQ")
    sp = spell_values(g.champion_bin("Senna"), "Senna", "SennaPassive")
    mp = spell_values(g.champion_bin("Smolder"), "Smolder", "SmolderP")
    mq = spell_values(g.champion_bin("Smolder"), "Smolder", "SmolderQ")

    champions = [
        {**champ("Veigar"), "stackName": "Phenomenal Evil", "unit": "AP", "perStack": 1.0,
         "events": [
             {"key": "hits", "label": "Abilities hitting champions", "stacks": vp["dAbilityStacks"][0], "rate": 6},
             {"key": "takedowns", "label": "Champion takedowns", "stacks": vp["dTakedownStacks"][0], "rate": 1},
         ],
         "ability": {"name": "Q · Baleful Strike (rank 5)", "base": vq["BaseDamage"][4], "ratio": vq["APRatio"][4], "stat": "AP"}},
        {**champ("Nasus"), "stackName": "Siphoning Strike", "unit": "Q damage", "perStack": 1.0,
         "events": [
             {"key": "minions", "label": "Q kills on small minions", "stacks": nq["BasicStacks"][0], "rate": 2},
             {"key": "big", "label": "Q kills on champions or large minions", "stacks": nq["BigStacks"][0], "rate": 0.5},
         ],
         "ability": {"name": "Q · Siphoning Strike (rank 5)", "base": nq["BonusDamage"][4], "ratio": 1.0, "stat": "AD"}},
        {**champ("Senna"), "stackName": "Mist", "unit": "AD", "perStack": sp["ADPerStack"][0],
         "events": [
             {"key": "souls", "label": "Souls and Mist absorbed", "stacks": 1, "rate": 3},
         ],
         "tiers": {"every": sp["StacksForBonus"][0], "range": sp["BonusRange"][0], "crit": sp["BonusCritChance"][0] / 100},
         "soulChance": sp["SoulDropPercentChance"][0]},
        {**champ("Smolder"), "stackName": "Dragon Practice", "unit": "Q damage", "perStack": mp["QDamagePerStack"][0],
         "events": [
             {"key": "hits", "label": "Abilities hitting champions", "stacks": 1, "rate": 8},
             {"key": "kills", "label": "Q kills on minions", "stacks": 1, "rate": 3},
         ],
         "milestones": [{"at": mq["StackTier1"][0], "label": "Q explodes"}, {"at": mq["StackTier2"][0], "label": "Q splits"},
                        {"at": mq["StackTier3"][0], "label": "Q burns and executes"}]},
    ]
    evil = g.augment("ARAM_PhenomenalEvil")
    write_data_js(os.path.join(HERE, "data.js"), "STACKING_DATA",
                  {"patch": g.version, "channel": g.ch, "champions": champions, "augments": [evil] if evil else []})
    print(g.version, [(c["name"], [(e["label"], e["stacks"]) for e in c["events"]]) for c in champions])


if __name__ == "__main__":
    main()
