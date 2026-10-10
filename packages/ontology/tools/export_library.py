#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Export the crop library (and the CityDemo example) for the app: packages/core/src/*.generated.ts.

    packages/ontology/.venv/bin/python packages/ontology/tools/export_library.py

The site and the Lambdas do not read Turtle at run time; they get the crop
library as typed data: names (EN, FR, DE, Latin), life cycle, growth form,
what the crop needs (for the calendar) and its typical windows. crops.ttl
stays the source; tests/test_library_export.py fails when this file drifts.
"""
import json
import os

from rdflib import Graph, Namespace
from rdflib.collection import Collection
from rdflib.namespace import RDF, RDFS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
LIBRARY = os.path.join(ROOT, "abox", "library", "crops.ttl")
OUT = os.path.join(ROOT, "..", "core", "src", "library.generated.ts")
EXAMPLE = os.path.join(ROOT, "abox", "examples", "citydemo-habitat.ttl")
EXAMPLE_OUT = os.path.join(ROOT, "..", "core", "src", "example.generated.ts")
RECIPES = os.path.join(ROOT, "abox", "recipes")
RECIPES_OUT = os.path.join(ROOT, "..", "core", "src", "recipes.generated.ts")
GUIDE = os.path.join(ROOT, "guides", "wormbed5-feeding.json")
GUIDE_OUT = os.path.join(ROOT, "..", "core", "src", "feedingGuide.generated.ts")
PERMA = Namespace("https://permaculture.digitalhome.cloud/ontology#")
SCHEMA = Namespace("https://schema.org/")
DWC = Namespace("http://rs.tdwg.org/dwc/terms/")
ID = "https://permaculture.digitalhome.cloud/id/"
NEEDS = ("sowMinTempC", "plantOutMinNightC", "boltAboveC", "frostTender", "daysToHarvest", "spacingCm",
         "sowingDepthMm", "seedsPerPoint", "germinationDays", "waterMmPerWeek")
INTS = ("daysToHarvest", "spacingCm", "sowingDepthMm", "seedsPerPoint", "germinationDays")


def local(node):
    return str(node).split("#")[-1] if node is not None else None


def export(g):
    crops = []
    for crop in sorted(g.subjects(RDF.type, PERMA.Crop)):
        names = {l.language: str(l) for l in g.objects(crop, RDFS.label) if l.language in ("en", "fr", "de", "la")}
        saving = g.value(crop, PERMA.seedSaving)
        needs = {}
        for n in NEEDS:
            v = g.value(crop, PERMA[n])
            if v is not None:
                v = v.toPython()
                needs[n] = v if isinstance(v, bool) else (int(v) if n in INTS else float(v))
        windows = []
        for w in g.objects(crop, PERMA.typicalWindow):
            x = {"activity": local(g.value(w, PERMA.activity)),
                 "from": int(g.value(w, PERMA.fromMonth)), "to": int(g.value(w, PERMA.toMonth))}
            if g.value(w, PERMA.part) is not None:
                x["part"] = local(g.value(w, PERMA.part))
            windows.append(x)
        windows.sort(key=lambda x: (x["activity"], x["from"]))
        crops.append({
            "id": str(crop)[len(ID):],
            "names": dict(sorted(names.items())),
            "lifeCycle": local(g.value(saving, PERMA.lifeCycle)) if saving is not None else None,
            "growthForm": local(g.value(crop, PERMA.growthForm)),
            "parts": sorted(local(g.value(y, PERMA.part)) for y in g.objects(crop, PERMA.yields)),
            "needs": needs,
            "windows": windows,
            **({"mix": mix(g, crop)} if g.value(crop, PERMA.feeding) is not None else {}),
            **({"coverCrop": True} if g.value(crop, PERMA.coverCrop) is not None and g.value(crop, PERMA.coverCrop).toPython() else {}),
        })
    return crops


def mix(g, crop):
    """What the crop takes from the bed and gives to it. Neighbours are stated once and hold both ways."""
    def both(prop):
        return sorted({str(o)[len(ID):] for o in g.objects(crop, prop)} | {str(s)[len(ID):] for s in g.subjects(prop, crop)})
    return {"family": str(g.value(crop, DWC.family)), "feeding": local(g.value(crop, PERMA.feeding)),
            "rootDepth": local(g.value(crop, PERMA.rootDepth)), "heightCm": int(g.value(crop, PERMA.heightCm)),
            "gives": sorted(local(o) for o in g.objects(crop, PERMA.gives)),
            "good": both(PERMA.goodNeighbour), "bad": both(PERMA.badNeighbour)}


def export_recipes():
    """Every recipe of abox/recipes, as the app shows it: its lines as written, each linked to a crop where one grows."""
    out = []
    for name in sorted(os.listdir(RECIPES)):
        if not name.endswith(".ttl"):
            continue
        g = Graph().parse(os.path.join(RECIPES, name))
        for r in sorted(g.subjects(RDF.type, SCHEMA.Recipe)):
            lines = []
            for use in g.objects(r, PERMA.usesIngredient):
                crop = g.value(use, PERMA.crop)
                lines.append({"text": str(g.value(use, SCHEMA.name)),
                              **({"cropId": str(crop)[len(ID):], "part": local(g.value(use, PERMA.part)),
                                  "methods": sorted(local(m) for m in g.objects(use, PERMA.acceptsMethod))} if crop is not None else {})})
            steps = g.value(r, SCHEMA.recipeInstructions)
            out.append({
                "id": str(r)[len(ID):],
                "names": dict(sorted((l.language, str(l)) for l in g.objects(r, SCHEMA.name) if l.language)),
                "yield": str(g.value(r, SCHEMA.recipeYield) or ""),
                "description": str(g.value(r, SCHEMA.description) or ""),
                "keepsAs": local(g.value(r, PERMA.preservesAs)),
                "lines": sorted(lines, key=lambda x: ("cropId" not in x, x["text"])),
                "steps": [str(s) for s in Collection(g, steps)] if steps is not None else [],
            })
    return out


def render_recipes():
    return ("// GENERATED by packages/ontology/tools/export_library.py from abox/recipes/*.ttl. Do not edit.\n"
            'import type { Recipe } from "./recipes.js";\n\n'
            f"export const RECIPES: Recipe[] = {json.dumps(export_recipes(), ensure_ascii=False, indent=2)};\n")


def render(crops):
    return ("// GENERATED by packages/ontology/tools/export_library.py from abox/library/crops.ttl. Do not edit.\n"
            'import type { LibraryCrop } from "./library.js";\n\n'
            f"export const LIBRARY: LibraryCrop[] = {json.dumps(crops, ensure_ascii=False, indent=2)};\n")


def render_example():
    with open(EXAMPLE) as fh:
        ttl = fh.read()
    return ("// GENERATED by packages/ontology/tools/export_library.py from abox/examples/citydemo-habitat.ttl. Do not edit.\n"
            "/** CityDemo: an invented habitat, offered to an empty one as an example. */\n"
            f"export const CITYDEMO_TTL = {json.dumps(ttl, ensure_ascii=False)};\n")


def render_guide():
    with open(GUIDE) as fh:
        guide = json.load(fh)
    return ("// GENERATED by packages/ontology/tools/export_library.py from guides/wormbed5-feeding.json. Do not edit.\n"
            "/** The WormBed5 feeding guide: what the worms are fed, how much, where and when. The twin edge enforces it. */\n"
            f"export const FEEDING_GUIDE = {json.dumps(guide, ensure_ascii=False, indent=2)} as const;\n")


def main():
    for path, text in ((OUT, render(export(Graph().parse(LIBRARY)))), (EXAMPLE_OUT, render_example()), (GUIDE_OUT, render_guide()),
                       (RECIPES_OUT, render_recipes())):
        with open(path, "w") as fh:
            fh.write(text)
        print(f"-> {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
