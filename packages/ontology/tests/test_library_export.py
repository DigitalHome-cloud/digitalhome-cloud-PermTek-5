# SPDX-License-Identifier: GPL-3.0-or-later
"""The app's copy of the crop library (packages/core/src/library.generated.ts) matches crops.ttl."""
import os
import sys

from rdflib import Graph

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import export_library  # noqa: E402


def test_the_generated_library_has_not_drifted():
    expected = export_library.render(export_library.export(Graph().parse(export_library.LIBRARY)))
    with open(export_library.OUT) as fh:
        assert fh.read() == expected, "run: packages/ontology/.venv/bin/python packages/ontology/tools/export_library.py"
    with open(export_library.EXAMPLE_OUT) as fh:
        assert fh.read() == export_library.render_example(), "run: packages/ontology/tools/export_library.py"
    with open(export_library.RECIPES_OUT) as fh:
        assert fh.read() == export_library.render_recipes(), "run: packages/ontology/tools/export_library.py"
    with open(export_library.GUIDE_OUT) as fh:
        assert fh.read() == export_library.render_guide(), "run: packages/ontology/tools/export_library.py"


def test_the_feeding_guide_is_complete_in_three_languages():
    import json
    with open(export_library.GUIDE) as fh:
        guide = json.load(fh)
    langs = {"en", "de", "fr"}
    assert set(guide["about"]) == langs
    for key, kind in guide["kinds"].items():
        assert kind["class"] in guide["classes"] and set(kind["label"]) == langs, key
        assert (kind["class"] == "limited") == ("weeklySharePct" in kind), key
    for key, text in guide["ruleTexts"].items():
        assert set(text) == langs, key
    assert all(set(p) == langs for p in guide["preparation"])
    assert {"brownsPerScraps", "maxDaysOfFoodInBox", "maxGramsPerSpot", "minHoursBetweenFeedings", "minCoreC"} <= guide["rules"].keys()


def test_trees_have_windows_and_annuals_have_needs():
    crops = {c["id"]: c for c in export_library.export(Graph().parse(export_library.LIBRARY))}
    for t in ("crop-pear", "crop-plum", "crop-sweet-cherry", "crop-sour-cherry", "crop-apple"):
        assert crops[t]["growthForm"] == "Tree" and {"Flowering", "Harvest"} <= {w["activity"] for w in crops[t]["windows"]}, t
    for a in ("crop-lettuce", "crop-radish", "crop-tomato"):
        assert {"sowMinTempC", "daysToHarvest", "spacingCm"} <= crops[a]["needs"].keys(), a
    assert crops["crop-tomato"]["needs"]["frostTender"] is True
    assert set(crops["crop-lettuce"]["names"]) == {"en", "fr", "de", "la"}


def test_mixed_planting_attributes_hold_both_ways_and_recipes_link_to_crops():
    crops = {c["id"]: c for c in export_library.export(Graph().parse(export_library.LIBRARY))}
    assert crops["crop-carrot"]["mix"]["feeding"] == "LightFeeder" and crops["crop-carrot"]["mix"]["rootDepth"] == "DeepRoot"
    assert "crop-onion" in crops["crop-carrot"]["mix"]["good"] and "crop-carrot" in crops["crop-onion"]["mix"]["good"]
    assert "crop-bush-bean" in crops["crop-onion"]["mix"]["bad"] and "crop-onion" in crops["crop-bush-bean"]["mix"]["bad"]
    assert crops["crop-bush-bean"]["mix"]["gives"] == ["FixesNitrogen"] and "mix" not in crops["crop-pear"]
    for c in crops.values():
        for other in c.get("mix", {}).get("good", []) + c.get("mix", {}).get("bad", []):
            assert other in crops, (c["id"], other)
        assert not set(c.get("mix", {}).get("good", [])) & set(c.get("mix", {}).get("bad", [])), c["id"]
    recipes = {r["id"]: r for r in export_library.export_recipes()}
    assert len(recipes) == 12
    burger = recipes["recipe-burger-aux-carottes"]
    assert {l.get("cropId") for l in burger["lines"]} >= {"crop-carrot", "crop-chives", "crop-onion", "crop-rocket", "crop-cucumber"}
    assert any("cropId" not in l for l in burger["lines"]), "what is bought stays a line of text"
    assert recipes["recipe-ratatouille"]["steps"] and recipes["recipe-ratatouille"]["keepsAs"] == "Frozen"
