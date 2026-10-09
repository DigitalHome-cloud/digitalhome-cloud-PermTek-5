# Ontology (perma-core modules)

The vocabulary of the permaculture site model: what the cloud's A-Boxes, the
nest's copy and the twin's site files talk about (ADR 0012). Standard
vocabularies stay read-only (GeoSPARQL, SOSA, Darwin Core, REC, Brick); these
files add only what they lack. English is the master label; German and French
are given for everything a person sees.

| File | What |
|---|---|
| `tbox/perma-vegetation.ttl` | the vegetation map: `perma:VegetationUnit`, `VegetationPatch`, `Plant`; class, status, map status, height, canopy, dominant taxon, source |
| `tbox/perma-vegetation-concepts.ttl` | SKOS schemes: vegetation classes (tree, shrub, hedge, bramble, meadow, tall grass, crop, bare soil), statuses (existing, planted, planned), map statuses (to confirm, confirmed, rejected) |
| `shapes/perma-vegetation-shapes.ttl` | SHACL: what a vegetation A-Box must satisfy |
| `abox/examples/permademo-vegetation.ttl` | **generated** from `twin/sites/permademo/site.json` (invented site) |
| `tools/vegetation_abox.py` | a site file's vegetation layer → A-Box, validated with the shapes |
| `tbox/perma-food.ttl`, `tbox/perma-food-concepts.ttl` | crops (`perma:Crop`, harvested parts and how long they keep), site calendars (`perma:SeasonWindow`: sow, plant out, harvest, month to month), recipes (`schema:Recipe` with `perma:IngredientUse` linked to crop and part); plant parts and garden activities as SKOS |
| `shapes/perma-food-shapes.ttl` | SHACL for crops, calendars and recipes |
| `abox/library/crops.ttl` | the **shared crop library** (same for every project), curated, 17 crops (vegetables, herbs, apple, walnut, and the spices of the recipes): names in English, French, German and Latin; parts and ways of keeping; seed saving (life cycle, pollination, what it crosses with, isolation, years the seed stays good) |
| `tbox/perma-taxa.ttl` | taxon links: `perma:taxrefId` (TAXREF CD_NOM), `perma:iucnGlobalStatus`; to merge into perma-bio |
| `abox/library/taxa-wikidata.ttl` | **generated** by `tools/wikidata_link.py`: for each GBIF taxon, its Wikidata item and TAXREF ID (`skos:exactMatch`, `perma:taxrefId`), global IUCN category when Wikidata has one |
| `abox/library/crops-gbif.ttl` | **generated** by `tools/gbif_link.py`: each crop's GBIF taxon (`perma:taxon`), classification, and GBIF's vernacular names EN/FR/DE as `skos:altLabel` (for search; GBIF names cover the whole species) |
| `abox/examples/permademo-seasons.ttl` | PermaDemo's **site calendar** (each site has its own; a real site's stays in its private pack) |
| `abox/recipes/*.ttl` | 8 recipes, lines linked to crops, parts and the ways they are accepted; each says how its result keeps: courgettes marinées (vinegar), ratatouille (frozen), sauce tomate (bottled), pistou (frozen), choucroute (fermented), vin de noix (macerated), compote de pommes (bottled), herbes séchées (dried) |
| `tools/seasons.py` | `calendar SITE`: what grows when; `recipe RECIPE SITE`: when the recipe comes from the garden, and what to buy; `pantry SITE`: month by month what the garden gives, fresh or kept (cellar, dried, frozen ...); `seeds SITE`: how to keep each crop going (seed, cloves, cuttings, grafting) and when seed is ripe there; `menu SITE`: every recipe's months from the garden and how it keeps; `sow SITE [--month M] [--recipes a,b]`: what to sow or plant now and in the next months for the recipes you want, perennials in place and what to buy |

```bash
python3 -m venv packages/ontology/.venv && packages/ontology/.venv/bin/pip install pyshacl rdflib pytest
env -u PYTHONPATH packages/ontology/.venv/bin/python -m pytest -q packages/ontology/tests
env -u PYTHONPATH packages/ontology/.venv/bin/python packages/ontology/tools/vegetation_abox.py \
    twin/sites/permademo/site.json packages/ontology/abox/examples/permademo-vegetation.ttl --site-id permademo
```

(`env -u PYTHONPATH`: ROS's pytest plugins leak in otherwise.)

```bash
env -u PYTHONPATH packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py recipe \
    packages/ontology/abox/recipes/courgettes-marinees.ttl packages/ontology/abox/examples/permademo-seasons.ttl --lang fr
```

```bash
env -u PYTHONPATH packages/ontology/.venv/bin/python packages/ontology/tools/gbif_link.py       # refresh the GBIF links (no key)
env -u PYTHONPATH packages/ontology/.venv/bin/python packages/ontology/tools/wikidata_link.py   # then TAXREF and Wikidata via the GBIF IDs
```

**TAXREF.** Its API (taxref.mnhn.fr) answers scripts with a bot challenge
since the MNHN cyberattack (checked 2026-10-09), so the TAXREF ID comes from
Wikidata (P3186). French protection and red-list statuses are not in
Wikidata; they are to come from TAXREF's downloadable status file
(data.gouv.fr), cached locally as the build plan says.

**A crop is not a species.** Courgette, pumpkin and pâtisson are all
*Cucurbita pepo*: the crop keeps our names and links the species' GBIF taxon.

**Three layers, shared differently**: the crop library is global (later the
Modeler's library); a calendar belongs to one site, because climate, altitude
and exposure move the windows; recipes belong to a household or a project.
Calendars start from general practice, all *to confirm*, and should be
corrected by the site's own harvest records (the register, later the rovers'
phenology observations).

**Where this goes.** These files move into the cloud's `packages/ontology`
when permaculture-cloud is generated (template layout: `tbox/`, `shapes/`,
`abox/examples/`), and are copied to the nest's `edge/ontology/`.

**Open.** perma-core itself (Zone, Guild, Intervention, the Suggested /
Confirmed / Rejected scheme, observedInZone) lives in the owner's
"Permaculture" project and is not in this folder yet; `perma:Plant` and the
map statuses here must be merged with it. The namespace is provisional (build
plan, open decision "Namespaces").

What a vegetation class means for a rover (drive cost, solid, canopy and GNSS)
is simulation physics and lives in `twin/stigmergy/vegetation.py`.

**Next for the library**: see the build plan, "Plant knowledge" (PFAF by mail and crop by
crop when scaling, TAXREF statuses, Pl@ntNet, BioCLIP 2).
