# SPDX-License-Identifier: GPL-3.0-or-later
"""The food module: crop library, site calendars and recipes validate, and the season logic is right."""
import os
import sys

from rdflib import Graph
from rdflib.namespace import RDF, SKOS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import seasons  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..")
RECIPE = os.path.join(ROOT, "abox", "recipes", "courgettes-marinees.ttl")
DEMO = os.path.join(ROOT, "abox", "examples", "permademo-seasons.ttl")


def test_concepts_in_en_de_fr():
    g = Graph().parse(os.path.join(ROOT, "tbox", "perma-food-concepts.ttl"))
    for c in g.subjects(RDF.type, SKOS.Concept):
        assert {"en", "de", "fr"} <= {o.language for o in g.objects(c, SKOS.prefLabel)}, c


def test_library_recipe_and_calendar_conform():
    g = seasons.load(RECIPE, DEMO)            # exits on a SHACL violation
    assert len(set(g.subjects(RDF.type, seasons.PERMA.Crop))) == 35


def test_span_runs_over_the_new_year():
    assert seasons.span(11, 2) == {11, 12, 1, 2}
    assert seasons.span(7, 7) == {7}


def test_stored_parts_stay_available_fresh_ones_do_not():
    g = seasons.load(DEMO)
    P, ID = seasons.PERMA, "https://permaculture.digitalhome.cloud/id/"
    from rdflib import URIRef
    onion = URIRef(ID + "crop-onion")
    assert seasons.available(g, onion, P.Bulb) == {7, 8, 9, 10, 11, 12, 1, 2}           # 6 months in the cellar
    assert seasons.available(g, onion, P.Bulb, accepted={P.Fresh}) == {7, 8}
    dill = URIRef(ID + "crop-dill")
    assert seasons.available(g, dill, P.Leaf, accepted={P.Dried}) == set(range(1, 13))  # dried: all year


def test_recipe_window_on_permademo(capsys):
    class A:
        recipe, site, lang = RECIPE, DEMO, "en"
    seasons.cmd_recipe(A)
    out = capsys.readouterr().out
    assert "months it can be made from the garden: J7, A8, S9" in out
    assert "Black pepper: not grown on this site" in out


def test_a_window_with_a_bad_month_is_refused(tmp_path):
    bad = tmp_path / "bad.ttl"
    bad.write_text('@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> .\n'
                   '@prefix id: <https://permaculture.digitalhome.cloud/id/> .\n'
                   '[] a perma:SeasonWindow ; perma:atSite id:site-x ; perma:forCrop id:crop-onion ;'
                   ' perma:activity perma:Harvest ; perma:fromMonth 13 ; perma:toMonth 2 ;'
                   ' perma:confirmation perma:ToConfirm .\n')
    import pytest
    with pytest.raises(SystemExit):
        seasons.load(str(bad))


def test_every_crop_has_en_fr_de_and_latin_names_and_a_gbif_taxon():
    g = seasons.load(DEMO)
    from rdflib.namespace import RDFS
    for crop in g.subjects(RDF.type, seasons.PERMA.Crop):
        assert {"en", "fr", "de", "la"} <= {l.language for l in g.objects(crop, RDFS.label)}, crop
        taxon = g.value(crop, seasons.PERMA.taxon)
        assert taxon is not None and str(taxon).startswith("https://www.gbif.org/species/"), crop


def test_a_crop_without_a_latin_name_is_refused(tmp_path):
    bad = tmp_path / "bad.ttl"
    bad.write_text('@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> .\n'
                   '@prefix id: <https://permaculture.digitalhome.cloud/id/> .\n'
                   '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n'
                   '@prefix dwc: <http://rs.tdwg.org/dwc/terms/> .\n'
                   'id:crop-x a perma:Crop ; rdfs:label "X"@en , "X"@fr , "X"@de ; dwc:scientificName "X y" ;'
                   ' perma:yields [ perma:part perma:Fruit ; perma:keeps [ perma:method perma:Fresh ; perma:storageMonths 0 ] ] .\n')
    import pytest
    with pytest.raises(SystemExit):
        seasons.load(str(bad))


def test_seed_saving_on_the_demo_calendar(capsys):
    class A:
        site, lang = DEMO, "en"
    seasons.cmd_seeds(A)
    out = capsys.readouterr().out
    assert "Onion (Allium cepa) - biennial" in out
    assert "Courgette (Cucurbita pepo)" in out and "ripe here: S9" in out


def test_gbif_names_are_picked_by_language_and_source():
    import gbif_link
    picked = gbif_link.pick_names([
        {"language": "fra", "vernacularName": "Courge pépon, Courgette", "source": "TAXREF"},
        {"language": "fra", "vernacularName": "courgette", "source": "Other"},
        {"language": "eng", "vernacularName": "Marrow", "source": "Catalogue of Life"},
        {"language": "ita", "vernacularName": "Zucchina", "source": "x"}])
    assert picked == {"fr": ["Courge pépon", "Courgette"], "en": ["Marrow"]}


# Wikidata's item for the current name has no TAXREF ID yet; fill from TAXREF's own file.
# Wikidata has no TAXREF id for these (October 2026); plum's GBIF key has no Wikidata item at all.
KNOWN_TAXREF_GAPS = {f"https://permaculture.digitalhome.cloud/id/crop-{c}" for c in ("rosemary", "pear", "parsley", "plum")}


def test_every_crop_taxon_has_a_taxref_id():
    g = seasons.load(DEMO)
    for crop in g.subjects(RDF.type, seasons.PERMA.Crop):
        taxon = g.value(crop, seasons.PERMA.taxon)
        has = str(g.value(taxon, seasons.PERMA.taxrefId) or "").isdigit()
        assert has != (str(crop) in KNOWN_TAXREF_GAPS), crop


def test_wikidata_linking_refuses_ambiguity():
    import wikidata_link as wl
    from rdflib import URIRef
    taxa = {"1": URIRef(wl.GBIF_SPECIES + "1"), "2": URIRef(wl.GBIF_SPECIES + "2"), "3": URIRef(wl.GBIF_SPECIES + "3")}
    rows = [
        {"gbif": {"value": "1"}, "item": {"value": wl.WD + "Q1"}, "taxref": {"value": "11"}},
        {"gbif": {"value": "2"}, "item": {"value": wl.WD + "Q2"}},
        {"gbif": {"value": "2"}, "item": {"value": wl.WD + "Q22"}},            # two items for one GBIF ID
        {"gbif": {"value": "3"}, "item": {"value": wl.WD + "Q3"}, "taxref": {"value": "31"}},
        {"gbif": {"value": "3"}, "item": {"value": wl.WD + "Q3"}, "taxref": {"value": "32"}},   # two TAXREF IDs
    ]
    g, problems = wl.link(rows, taxa)
    assert str(g.value(taxa["1"], wl.PERMA.taxrefId)) == "11"
    assert g.value(taxa["3"], wl.PERMA.taxrefId) is None
    assert len(problems) == 2


def test_every_recipe_conforms_and_the_menu_reads_right(capsys):
    class A:
        site, lang = DEMO, "en"
    seasons.cmd_menu(A)                                  # loads every recipe: exits on a SHACL violation
    out = capsys.readouterr().out
    lines = {l[:32].strip(): l[33:56] for l in out.splitlines() if "  " in l}
    assert lines["Walnut wine"] == ". . . . . * . . . . . ."            # green walnuts at the Saint-Jean only
    assert lines["Garden dried herbs"] == "* * * * * * * * * * * *"     # perennial herbs: all year
    assert lines["Home-made sauerkraut"].startswith("* * *")           # cabbages from the cellar into winter


def test_garlic_is_kept_from_cloves_and_apple_by_grafting():
    g = seasons.load(DEMO)
    from rdflib import URIRef
    P, ID = seasons.PERMA, "https://permaculture.digitalhome.cloud/id/"
    def prop(crop):
        return set(g.objects(g.value(URIRef(ID + crop), P.seedSaving), P.propagation))
    assert prop("crop-garlic") == {P.FromCloves}
    assert P.ByGrafting in prop("crop-apple") and P.FromSeed not in prop("crop-apple")


def test_sow_now_works_backwards_from_the_recipes(capsys):
    class A:
        site, lang, month, ahead, recipes = DEMO, "en", 10, 2, None
    seasons.cmd_sow(A)
    out = capsys.readouterr().out
    now = out.split("coming up")[0]
    assert "Garlic" in now and "Pistou" in now                     # plant garlic in October for next year's pistou
    assert "in place" in out and "Apple" in out.split("in place")[1]
    assert "Black pepper" in out.split("to buy")[1]


def test_sow_for_chosen_recipes_only(capsys):
    class A:
        site, lang, month, ahead, recipes = DEMO, "en", 2, 2, "ratatouille"
    seasons.cmd_sow(A)
    out = capsys.readouterr().out
    assert "Aubergine" in out.split("coming up")[0]                 # under cover in February
    assert "only if not planted yet" in out                          # thyme, bay: perennials
    assert "Pistou" not in out and "Garlic" not in out.split("coming up")[1]
