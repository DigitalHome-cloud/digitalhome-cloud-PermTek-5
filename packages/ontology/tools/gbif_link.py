#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Link the crop library to the GBIF Backbone Taxonomy.

    packages/ontology/.venv/bin/python packages/ontology/tools/gbif_link.py            # writes abox/library/crops-gbif.ttl

For every perma:Crop in abox/library/crops.ttl, its dwc:scientificName is
matched against GBIF (species/match, kingdom Plantae). An exact match to an
accepted name (or a synonym, followed to its accepted name) becomes
perma:taxon <https://www.gbif.org/species/KEY>, and the taxon gets GBIF's
classification and its vernacular names in English, French and German as
skos:altLabel (for search: GBIF's names are for the whole species, e.g.
Cucurbita pepo is courgette, pumpkin and pâtisson).

The curated library (crops.ttl, our labels) is never rewritten; this writes
a separate generated file. Anything not matched exactly is reported and left
out, for a person to look at. No API key needed.
"""
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCTERMS, RDF, SKOS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
LIBRARY = os.path.join(ROOT, "abox", "library", "crops.ttl")
OUT = os.path.join(ROOT, "abox", "library", "crops-gbif.ttl")
PERMA = Namespace("https://permaculture.digitalhome.cloud/ontology#")
DWC = Namespace("http://rs.tdwg.org/dwc/terms/")
GBIF_SPECIES = "https://www.gbif.org/species/"
API = "https://api.gbif.org/v1"
LANGS = {"eng": "en", "fra": "fr", "deu": "de"}
# preferred sources for vernacular names, best first
SOURCES = ("TAXREF", "Catalogue of Life", "GRIN Taxonomy", "Info Flora", "Flora Helvetica")
MAX_NAMES = 6
MIN_CONFIDENCE = 90


def get(path, **params):
    url = f"{API}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"User-Agent": "permaculture-digitalhome-cloud/0.1 (crop library)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def accepted_match(name, fetch=get):
    """(usage dict, problem) for a scientific name: exact, accepted (synonyms followed)."""
    m = fetch("/species/match", name=name, kingdom="Plantae", strict="true")
    if m.get("matchType") != "EXACT" or m.get("confidence", 0) < MIN_CONFIDENCE:
        return None, f"no exact match (matchType {m.get('matchType')}, confidence {m.get('confidence')})"
    key = m.get("acceptedUsageKey") if m.get("synonym") else m.get("usageKey")
    usage = fetch(f"/species/{key}")
    if usage.get("taxonomicStatus") != "ACCEPTED":
        return None, f"GBIF {key} is {usage.get('taxonomicStatus')}"
    return usage, None


def pick_names(results):
    """Up to MAX_NAMES distinct vernacular names per language, preferred sources first."""
    def rank(r):
        src = r.get("source", "")
        return next((i for i, s in enumerate(SOURCES) if s in src), len(SOURCES))
    out = {}
    for r in sorted(results, key=rank):
        lang = LANGS.get(r.get("language"))
        if not lang:
            continue
        for name in (n.strip() for n in r["vernacularName"].split(",")):
            names = out.setdefault(lang, [])
            if name and name.lower() not in (n.lower() for n in names) and len(names) < MAX_NAMES:
                names.append(name)
    return out


def link(fetch=get):
    lib = Graph().parse(LIBRARY)
    g = Graph()
    for prefix, ns in (("perma", PERMA), ("dwc", DWC), ("skos", SKOS), ("dcterms", DCTERMS)):
        g.bind(prefix, ns)
    today = Literal(datetime.date.today().isoformat(), datatype=URIRef("http://www.w3.org/2001/XMLSchema#date"))
    problems = []
    for crop in sorted(lib.subjects(RDF.type, PERMA.Crop)):
        name = str(lib.value(crop, DWC.scientificName))
        usage, problem = accepted_match(name, fetch)
        if problem:
            problems.append(f"{crop.split('/')[-1]} ({name}): {problem}")
            continue
        key = usage["key"]
        taxon = URIRef(f"{GBIF_SPECIES}{key}")
        g.add((crop, PERMA.taxon, taxon))
        g.add((taxon, RDF.type, DWC.Taxon))
        g.add((taxon, DWC.taxonID, Literal(f"gbif:{key}")))
        g.add((taxon, DWC.scientificName, Literal(usage["scientificName"])))
        if usage.get("authorship"):
            g.add((taxon, DWC.scientificNameAuthorship, Literal(usage["authorship"].strip())))
        g.add((taxon, DWC.taxonRank, Literal(usage["rank"].lower())))
        g.add((taxon, DWC.taxonomicStatus, Literal(usage["taxonomicStatus"].lower())))
        for term in ("kingdom", "family", "genus"):
            if usage.get(term):
                g.add((taxon, DWC[term], Literal(usage[term])))
        g.add((taxon, DCTERMS.source, Literal("GBIF Backbone Taxonomy")))
        g.add((taxon, DCTERMS.modified, today))
        names = pick_names(fetch(f"/species/{key}/vernacularNames", limit=500)["results"])
        for lang, ns_ in names.items():
            for n in ns_:
                g.add((taxon, SKOS.altLabel, Literal(n, lang=lang)))
        print(f"{crop.split('/')[-1]:22s} -> GBIF {key} {usage['scientificName']} ({usage.get('family')}); "
              + ", ".join(f"{l}: {len(v)}" for l, v in sorted(names.items())))
    return g, problems


def main():
    g, problems = link()
    header = ("# Generated by packages/ontology/tools/gbif_link.py from the GBIF Backbone Taxonomy (api.gbif.org).\n"
              "# Do not edit: rerun the tool. Our own names stay in crops.ttl; GBIF's vernacular names\n"
              "# are for the whole species and only help search.\n")
    with open(OUT, "w") as fh:
        fh.write(header + g.serialize(format="turtle"))
    print(f"-> {OUT}")
    for p in problems:
        print(f"NOT LINKED: {p}", file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
