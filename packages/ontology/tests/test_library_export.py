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


def test_trees_have_windows_and_annuals_have_needs():
    crops = {c["id"]: c for c in export_library.export(Graph().parse(export_library.LIBRARY))}
    for t in ("crop-pear", "crop-plum", "crop-sweet-cherry", "crop-sour-cherry", "crop-apple"):
        assert crops[t]["growthForm"] == "Tree" and {"Flowering", "Harvest"} <= {w["activity"] for w in crops[t]["windows"]}, t
    for a in ("crop-lettuce", "crop-radish", "crop-tomato"):
        assert {"sowMinTempC", "daysToHarvest", "spacingCm"} <= crops[a]["needs"].keys(), a
    assert crops["crop-tomato"]["needs"]["frostTender"] is True
    assert set(crops["crop-lettuce"]["names"]) == {"en", "fr", "de", "la"}
