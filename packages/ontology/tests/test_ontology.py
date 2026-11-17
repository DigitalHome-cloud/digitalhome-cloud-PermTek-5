# SPDX-License-Identifier: GPL-3.0-or-later
"""The vegetation module parses, is labelled in EN/DE/FR, and its shapes accept good data and refuse bad.

    packages/ontology/.venv/bin/python -m pytest -q packages/ontology/tests
"""
import os

import pytest
from pyshacl import validate
from rdflib import Graph, Namespace
from rdflib.namespace import RDF, SKOS

ROOT = os.path.join(os.path.dirname(__file__), "..")
PERMA = Namespace("https://permaculture.digitalhome.cloud/ontology#")
P = ("@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix id: <https://permaculture.digitalhome.cloud/id/> ."
     " @prefix geo: <http://www.opengis.net/ont/geosparql#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n")


def load(*rel):
    g = Graph()
    for r in rel:
        g.parse(os.path.join(ROOT, r), format="turtle")
    return g


def check(abox_ttl):
    data = load("tbox/perma-vegetation-concepts.ttl")
    data.parse(data=abox_ttl, format="turtle")
    ok, _, text = validate(data, shacl_graph=load("shapes/perma-vegetation-shapes.ttl"))
    return ok, text


def test_files_parse():
    for f in ("tbox/perma-vegetation.ttl", "tbox/perma-vegetation-concepts.ttl", "shapes/perma-vegetation-shapes.ttl"):
        assert len(load(f)) > 10, f


@pytest.mark.parametrize("f", ["tbox/perma-vegetation-concepts.ttl"])
def test_every_concept_in_en_de_fr(f):
    g = load(f)
    for c in g.subjects(RDF.type, SKOS.Concept):
        langs = {o.language for o in g.objects(c, SKOS.prefLabel)}
        assert {"en", "de", "fr"} <= langs, c


def test_the_classes_asked_for_exist():
    g = load("tbox/perma-vegetation-concepts.ttl")
    for name in ("Tree", "Shrub", "Hedge", "Meadow", "TallGrass", "Bramble", "BareSoil", "Crop"):
        assert (PERMA[name], SKOS.inScheme, PERMA.VegetationClasses) in g, name


def test_example_conforms():
    with open(os.path.join(ROOT, "abox/examples/permademo-vegetation.ttl")) as fh:
        ok, text = check(fh.read())
    assert ok, text


def test_status_from_the_wrong_scheme_is_refused():
    ok, _ = check(P + 'id:x a perma:VegetationPatch ; rdfs:label "x" ; perma:vegetationClass perma:Planted ;'
                      ' perma:mapStatus perma:ToConfirm ; geo:hasGeometry [ geo:asWKT "POINT(0 0)" ] .')
    assert not ok


def test_unit_without_map_status_or_geometry_is_refused():
    ok, _ = check(P + 'id:x a perma:VegetationPatch ; rdfs:label "x" ; perma:vegetationClass perma:Meadow .')
    assert not ok
