window.STACKING_DATA = {
 "patch": "16.20.8248524",
 "channel": "latest",
 "champions": [
  {
   "alias": "Veigar",
   "name": "Veigar",
   "icon": "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/45.png",
   "stackName": "Phenomenal Evil",
   "unit": "AP",
   "perStack": 1.0,
   "events": [
    {
     "key": "hits",
     "label": "Abilities hitting champions",
     "stacks": 1.0,
     "rate": 6
    },
    {
     "key": "takedowns",
     "label": "Champion takedowns",
     "stacks": 3.0,
     "rate": 1
    }
   ],
   "ability": {
    "name": "Q · Baleful Strike (rank 5)",
    "base": 240.0,
    "ratio": 0.699999988079071,
    "stat": "AP"
   }
  },
  {
   "alias": "Nasus",
   "name": "Nasus",
   "icon": "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/75.png",
   "stackName": "Siphoning Strike",
   "unit": "Q damage",
   "perStack": 1.0,
   "events": [
    {
     "key": "minions",
     "label": "Q kills on small minions",
     "stacks": 6.0,
     "rate": 2
    },
    {
     "key": "big",
     "label": "Q kills on champions or large minions",
     "stacks": 24.0,
     "rate": 0.5
    }
   ],
   "ability": {
    "name": "Q · Siphoning Strike (rank 5)",
    "base": 110.0,
    "ratio": 1.0,
    "stat": "AD"
   }
  },
  {
   "alias": "Senna",
   "name": "Senna",
   "icon": "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/235.png",
   "stackName": "Mist",
   "unit": "AD",
   "perStack": 0.75,
   "events": [
    {
     "key": "souls",
     "label": "Souls and Mist absorbed",
     "stacks": 1,
     "rate": 3
    }
   ],
   "tiers": {
    "every": 20.0,
    "range": 20.0,
    "crit": 0.1
   },
   "soulChance": 0.3199999928474426
  },
  {
   "alias": "Smolder",
   "name": "Smolder",
   "icon": "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/901.png",
   "stackName": "Dragon Practice",
   "unit": "Q damage",
   "perStack": 0.25,
   "events": [
    {
     "key": "hits",
     "label": "Abilities hitting champions",
     "stacks": 1,
     "rate": 8
    },
    {
     "key": "kills",
     "label": "Q kills on minions",
     "stacks": 1,
     "rate": 3
    }
   ],
   "milestones": [
    {
     "at": 25.0,
     "label": "Q explodes"
    },
    {
     "at": 125.0,
     "label": "Q splits"
    },
    {
     "at": 225.0,
     "label": "Q burns and executes"
    }
   ]
  }
 ],
 "augments": [
  {
   "key": "ARAM_PhenomenalEvil",
   "id": 1390,
   "name": "Phenomenal Evil",
   "tier": "Gold",
   "icon": "https://raw.communitydragon.org/latest/game/assets/ux/kiwi/augments/icons/aram_phenomenalevil_small.png",
   "values": {
    "ProcCooldown": 1.0,
    "StartingAPIfSecondAugment": 40.0,
    "APPerProc": 1.0,
    "SpellIDCD": 3.0
   },
   "calcs": {},
   "text": "Permanently gain @APPerProc@ Ability Power when you damage enemy champions with Abilities. If taken as your second Augment, starts with @StartingAPIfSecondAugment@ Ability Power. You have gained @f1@ AP. Veigar would be proud!"
  }
 ]
};
