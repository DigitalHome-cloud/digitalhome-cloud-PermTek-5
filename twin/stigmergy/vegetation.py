# SPDX-License-Identifier: GPL-3.0-or-later
"""How each vegetation class behaves in the twin: for driving, for positioning, in the world.

The classes themselves are the ontology's (perma:VegetationClasses, in the
cloud's ontology package): tree, shrub, hedge, bramble, meadow, tall grass,
crop, bare soil. What they mean for a small rover is simulation physics and
belongs here, not in the ontology.

  drive   "free": normal cost; "slow": costs more to cross; "block": never driven into
  cost    multiplier on the planner's move cost
  solid   drawn in the world as a physical object (a rover bumps into it)
  colour  ground texture or object colour (RGB 0..255)
"""

CLASSES = {
    "tree":       {"drive": "block", "cost": 1.0, "solid": True,  "colour": (60, 95, 45)},
    "shrub":      {"drive": "block", "cost": 1.0, "solid": True,  "colour": (85, 115, 55)},
    "hedge":      {"drive": "block", "cost": 1.0, "solid": True,  "colour": (55, 85, 40)},
    "bramble":    {"drive": "block", "cost": 1.0, "solid": True,  "colour": (95, 80, 55)},
    "meadow":     {"drive": "free",  "cost": 1.0, "solid": False, "colour": (165, 190, 120)},
    "tall_grass": {"drive": "slow",  "cost": 1.6, "solid": False, "colour": (180, 175, 100)},
    "crop":       {"drive": "block", "cost": 1.0, "solid": False, "colour": (150, 120, 80)},
    "bare_soil":  {"drive": "free",  "cost": 0.9, "solid": False, "colour": (170, 130, 95)},
}


# A tree drawn as an AREA is a stand of trees (a wood, an old orchard): rovers drive under it,
# a little slower over roots and litter, and satellite positioning degrades beneath it.
WOODLAND = {"drive": "slow", "cost": 1.3, "solid": False, "colour": (70, 100, 55)}


def props(entry):
    cls = entry["class"]
    if cls not in CLASSES:
        raise ValueError(f"unknown vegetation class {cls!r}; known: {', '.join(CLASSES)}")
    if cls == "tree" and "polygon" in entry:
        return WOODLAND
    return CLASSES[cls]
