#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Crops, a site's seasons and recipes: what grows when here, and when a recipe comes from the garden.

    packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py calendar packages/ontology/abox/examples/permademo-seasons.ttl
    packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py recipe packages/ontology/abox/recipes/courgettes-marinees.ttl \\
        packages/ontology/abox/examples/permademo-seasons.ttl [--lang fr]

    packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py pantry packages/ontology/abox/examples/permademo-seasons.ttl
    packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py menu packages/ontology/abox/examples/permademo-seasons.ttl
    packages/ontology/.venv/bin/python packages/ontology/tools/seasons.py sow packages/ontology/abox/examples/permademo-seasons.ttl [--month 3] [--recipes ratatouille,pistou]

Everything is checked with the SHACL shapes first. An ingredient is available
from the garden in a month when its part is harvested then, or still keeps
from the last harvest in a way the recipe accepts (fresh, dried, cellar ...).
"""
import argparse
import os
import sys

from pyshacl import validate
from rdflib import Graph, Namespace
from rdflib.collection import Collection
from rdflib.namespace import RDF, RDFS, SKOS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PERMA = Namespace("https://permaculture.digitalhome.cloud/ontology#")
SCHEMA = Namespace("https://schema.org/")
LIBRARIES = [os.path.join(ROOT, "abox", "library", f) for f in ("crops.ttl", "crops-gbif.ttl", "taxa-wikidata.ttl")]
CONCEPTS = [os.path.join(ROOT, "tbox", f) for f in ("perma-food-concepts.ttl", "perma-vegetation-concepts.ttl")]
SHAPES = os.path.join(ROOT, "shapes", "perma-food-shapes.ttl")
MONTHS = {"en": "J F M A M J J A S O N D", "fr": "J F M A M J J A S O N D", "de": "J F M A M J J A S O N D"}
ACT = {PERMA.SowIndoors: "i", PERMA.SowOutdoors: "s", PERMA.PlantOut: "p", PERMA.Harvest: "H", PERMA.SaveSeed: "g"}


def load(*paths):
    g = Graph()
    for p in (*LIBRARIES, *CONCEPTS, *paths):
        g.parse(p, format="turtle")
    ok, _, text = validate(g, shacl_graph=Graph().parse(SHAPES))
    if not ok:
        print(text, file=sys.stderr)
        sys.exit(1)
    return g


def label(g, node, lang):
    labels = {l.language: str(l) for l in g.objects(node, RDFS.label)} | \
             {l.language: str(l) for l in g.objects(node, SCHEMA.name)} | \
             {l.language: str(l) for l in g.objects(node, SKOS.prefLabel)}
    return labels.get(lang) or labels.get("en") or next(iter(labels.values()), str(node).rsplit("/", 1)[-1])


def span(a, b):
    """Months a..b, running over the new year when b < a."""
    return {(a - 1 + k) % 12 + 1 for k in range((b - a) % 12 + 1)}


def windows(g, crop, activity=None):
    for w in g.subjects(PERMA.forCrop, crop):
        if activity is None or (w, PERMA.activity, activity) in g:
            yield w


def harvest_months(g, crop, part):
    """Months the part is harvested on the site in g (windows without a part count for every part)."""
    out = set()
    for w in windows(g, crop, PERMA.Harvest):
        wp = g.value(w, PERMA.part)
        if wp is None or wp == part:
            out |= span(int(g.value(w, PERMA.fromMonth)), int(g.value(w, PERMA.toMonth)))
    return out


def keeping_ways(g, crop, part):
    """{method: months it keeps} for the part, from the crop library."""
    out = {}
    for hp in g.objects(crop, PERMA.yields):
        if g.value(hp, PERMA.part) == part:
            for k in g.objects(hp, PERMA.keeps):
                out[g.value(k, PERMA.method)] = int(g.value(k, PERMA.storageMonths))
    return out


def available_by_method(g, crop, part, accepted=None):
    """{method: months the part can come from the garden that way}: harvested, then kept."""
    harvest = harvest_months(g, crop, part)
    out = {}
    for method, keep in keeping_ways(g, crop, part).items():
        if accepted and method not in accepted:
            continue
        months = set(harvest)
        for m in harvest:
            months |= {(m - 1 + k) % 12 + 1 for k in range(1, keep + 1)}
        if months:
            out[method] = months
    return out


def available(g, crop, part, accepted=None):
    return set().union(*available_by_method(g, crop, part, accepted).values()) if harvest_months(g, crop, part) else set()


def short(g, method, lang):
    text = label(g, method, lang)
    return (text if len(text) <= 14 else text.split()[0]).lower()


def row(months, mark="#"):
    return " ".join(mark if m in months else "." for m in range(1, 13))


def cmd_calendar(a):
    g = load(a.site)
    site = next(g.objects(None, PERMA.atSite))
    print(f"{str(site).rsplit('/', 1)[-1]}: i sow under cover, s sow outdoors, p plant out, H harvest\n")
    print(f"{'':16s} {MONTHS[a.lang]}")
    for crop in sorted(set(g.objects(None, PERMA.forCrop)), key=lambda c: label(g, c, a.lang)):
        cells = ["."] * 12
        for w in windows(g, crop):
            mark = ACT[g.value(w, PERMA.activity)]
            for m in span(int(g.value(w, PERMA.fromMonth)), int(g.value(w, PERMA.toMonth))):
                if cells[m - 1] in (".", "i", "s") or mark == "H":
                    cells[m - 1] = mark
        print(f"{label(g, crop, a.lang)[:16]:16s} {' '.join(cells)}")


def recipe_window(g, recipe, lang):
    """(lines, window, buy): per garden ingredient (name, ways, months); months it all comes from the garden."""
    window, buy, lines = set(range(1, 13)), [], []
    for use in g.objects(recipe, PERMA.usesIngredient):
        name = str(g.value(use, SCHEMA.name))
        crop = g.value(use, PERMA.crop)
        if crop is None:
            buy.append(name)
            continue
        part = g.value(use, PERMA.part)
        accepted = set(g.objects(use, PERMA.acceptsMethod)) or None
        ways = available_by_method(g, crop, part, accepted)
        months = set().union(*ways.values()) if ways else set()
        if not months:
            buy.append(f"{name} ({label(g, crop, lang)}: not grown on this site)")
            continue
        window &= months
        lines.append((name, ways, months))
    return lines, window, buy


def cmd_recipe(a):
    g = load(a.recipe, a.site)
    recipe = next(g.subjects(RDF.type, SCHEMA.Recipe))
    site = str(next(g.objects(None, PERMA.atSite))).rsplit("/", 1)[-1]
    print(f"{label(g, recipe, a.lang)} at {site}\n")
    print(f"{'':44s} {MONTHS[a.lang]}")
    lines, window, buy = recipe_window(g, recipe, a.lang)
    for name, ways, months in lines:
        kind = "/".join(short(g, m, a.lang) for m in sorted(ways, key=lambda m: -len(ways[m]))[:2])
        print(f"{name[:30]:30s} {kind:>13s} {row(months)}")
    print(f"\n{'from the garden':44s} {row(window, '*')}")
    print("\nto buy: " + "; ".join(buy))
    method = g.value(recipe, PERMA.preservesAs)
    if method is not None:
        days = g.value(recipe, PERMA.shelfLifeDays)
        print(f"\nthe result keeps as '{label(g, method, a.lang)}'" + (f" for about {days} days" if days else ""))
    names = "JFMAMJJASOND"
    print("\nmonths it can be made from the garden: " + (", ".join(names[m - 1] + str(m) for m in sorted(window))
                                                       if window else "none"))


RECIPES = os.path.join(ROOT, "abox", "recipes")
SOWING = (PERMA.SowIndoors, PERMA.SowOutdoors, PERMA.PlantOut)
MONTH_NAMES = {"en": "January February March April May June July August September October November December",
               "fr": "janvier février mars avril mai juin juillet août septembre octobre novembre décembre",
               "de": "Januar Februar März April Mai Juni Juli August September Oktober November Dezember"}


def all_recipes(site, only=None):
    """The site graph with every recipe in abox/recipes (or only the given ids, e.g. ratatouille,pistou)."""
    files = sorted(os.path.join(RECIPES, f) for f in os.listdir(RECIPES) if f.endswith(".ttl"))
    if only:
        wanted = {w.strip() for w in only.split(",")}
        files = [f for f in files if os.path.basename(f)[:-4] in wanted]
        missing = wanted - {os.path.basename(f)[:-4] for f in files}
        if missing:
            sys.exit(f"no such recipe: {', '.join(sorted(missing))} (see {RECIPES})")
    return load(site, *files)


def sow_plan(g, month, ahead, lang):
    """{crop: {"now": [(activity, a, b)], "soon": [(activity, a, b, first month)], "recipes": [...]}} for the crops the
    recipes need, plus the crops with nothing to sow (perennials, trees, bought)."""
    needs = {}
    for recipe in g.subjects(RDF.type, SCHEMA.Recipe):
        for use in g.objects(recipe, PERMA.usesIngredient):
            crop = g.value(use, PERMA.crop)
            if crop is not None:
                needs.setdefault(crop, set()).add(label(g, recipe, lang))
    soon_months = [(month - 1 + k) % 12 + 1 for k in range(1, ahead + 1)]
    plan, nothing = {}, []
    for crop, recipes in needs.items():
        now, soon = [], []
        for w in windows(g, crop):
            act = g.value(w, PERMA.activity)
            if act not in SOWING:
                continue
            a, b = int(g.value(w, PERMA.fromMonth)), int(g.value(w, PERMA.toMonth))
            months = span(a, b)
            if month in months:
                now.append((act, a, b))
            else:
                first = next((m for m in soon_months if m in months), None)
                if first is not None:
                    soon.append((act, a, b, first))
        if now or soon:
            plan[crop] = {"now": now, "soon": soon, "recipes": sorted(recipes)}
        elif not any(g.value(w, PERMA.activity) in SOWING for w in windows(g, crop)):
            grown = any(True for _ in windows(g, crop))
            nothing.append((crop, sorted(recipes), grown))
    return plan, nothing


def perennial(g, crop):
    return g.value(g.value(crop, PERMA.seedSaving), PERMA.lifeCycle) == PERMA.Perennial


def cmd_sow(a):
    """What to sow or plant now (and soon) on this site for the recipes you want."""
    import datetime
    month = a.month or datetime.date.today().month
    g = all_recipes(a.site, a.recipes)
    site = str(next(g.objects(None, PERMA.atSite))).rsplit("/", 1)[-1]
    mname = MONTH_NAMES[a.lang].split()
    plan, nothing = sow_plan(g, month, a.ahead, a.lang)

    once = {"en": " (perennial: only if not planted yet)", "fr": " (vivace : seulement si pas encore planté)",
            "de": " (mehrjährig: nur wenn noch nicht gepflanzt)"}[a.lang]

    def act(x, crop=None):
        return label(g, x, a.lang) + (once if crop is not None and perennial(g, crop) else "")

    def months(x, y):
        return mname[x - 1] if x == y else f"{mname[x - 1]}-{mname[y - 1]}"

    order = lambda c: label(g, c, a.lang)
    now = [c for c in sorted(plan, key=order) if plan[c]["now"]]
    print(f"{site}, {mname[month - 1]}: to sow or plant now\n")
    for c in now:
        for x, f_, t in plan[c]["now"]:
            print(f"  {label(g, c, a.lang):18s} {act(x, c):24s} ({months(f_, t)})  for: {', '.join(plan[c]['recipes'])}")
    if not now:
        print("  nothing for these recipes")
    soon = sorted(((c, x, f_, t, first) for c in plan for x, f_, t, first in plan[c]["soon"]),
                  key=lambda r: ((r[4] - month) % 12, order(r[0])))
    print(f"\ncoming up in the next {a.ahead} months\n")
    for c, x, f_, t, first in soon:
        print(f"  {mname[first - 1]:10s} {label(g, c, a.lang):18s} {act(x, c):24s} ({months(f_, t)})  "
              f"for: {', '.join(plan[c]['recipes'])}")
    if not soon:
        print("  nothing")
    in_place = [(c, r) for c, r, grown in nothing if grown]
    bought = [(c, r) for c, r, grown in nothing if not grown]
    if in_place:
        print("\nnothing to sow: trees and perennials in place")
        for c, recipes in sorted(in_place, key=lambda r: order(r[0])):
            print(f"  {label(g, c, a.lang):18s} for: {', '.join(recipes)}")
    if bought:
        print("\nnot grown on this site: to buy")
        for c, recipes in sorted(bought, key=lambda r: order(r[0])):
            print(f"  {label(g, c, a.lang):18s} for: {', '.join(recipes)}")




def cmd_menu(a):
    """Every recipe in abox/recipes: the months it comes from this site's garden, and how its result keeps."""
    files = sorted(os.path.join(RECIPES, f) for f in os.listdir(RECIPES) if f.endswith(".ttl"))
    g = load(a.site, *files)
    site = str(next(g.objects(None, PERMA.atSite))).rsplit("/", 1)[-1]
    print(f"{site}: when each recipe comes from the garden (* = every garden ingredient available)\n")
    print(f"{'':32s} {MONTHS[a.lang]}   keeps")
    for recipe in sorted(g.subjects(RDF.type, SCHEMA.Recipe), key=lambda r: label(g, r, a.lang)):
        _, window, buy = recipe_window(g, recipe, a.lang)
        method = g.value(recipe, PERMA.preservesAs)
        days = g.value(recipe, PERMA.shelfLifeDays)
        keeps = (f"{short(g, method, a.lang)} ~{int(days) // 30 or 1} mo" if int(days) >= 30 else
                 f"{short(g, method, a.lang)} {days} d") if method is not None and days is not None else ""
        print(f"{label(g, recipe, a.lang)[:32]:32s} {row(window, '*')}   {keeps}")


def cmd_pantry(a):
    """Month by month: what this site's garden can give, and how it was kept."""
    g = load(a.site)
    site = str(next(g.objects(None, PERMA.atSite))).rsplit("/", 1)[-1]
    print(f"{site}: what the garden can give, by way of keeping\n")
    print(f"{'':34s} {MONTHS[a.lang]}")
    for crop in sorted(set(g.objects(None, PERMA.forCrop)), key=lambda c: label(g, c, a.lang)):
        for hp in g.objects(crop, PERMA.yields):
            part = g.value(hp, PERMA.part)
            for method, months in sorted(available_by_method(g, crop, part).items(), key=lambda kv: -len(kv[1])):
                name = f"{label(g, crop, a.lang)} {label(g, part, a.lang).lower()}, {short(g, method, a.lang)}"
                print(f"{name[:34]:34s} {row(months)}")


def cmd_seeds(a):
    """Keeping the plants: how to save each crop's seed, and when it is ripe on this site."""
    g = load(a.site)
    site = str(next(g.objects(None, PERMA.atSite))).rsplit("/", 1)[-1]
    names = "JFMAMJJASOND"
    print(f"{site}: seed saving\n")
    for crop in sorted(set(g.subjects(RDF.type, PERMA.Crop)), key=lambda c: label(g, c, a.lang)):
        ss = g.value(crop, PERMA.seedSaving)
        latin = next((str(l) for l in g.objects(crop, RDFS.label) if l.language == "la"), "")
        if ss is None:
            print(f"{label(g, crop, a.lang)} ({latin}): no seed saving here\n")
            continue
        ripe = set()
        for w in windows(g, crop, PERMA.SaveSeed):
            ripe |= span(int(g.value(w, PERMA.fromMonth)), int(g.value(w, PERMA.toMonth)))
        iso = g.value(ss, PERMA.isolationM)
        print(f"{label(g, crop, a.lang)} ({latin}) - {label(g, g.value(ss, PERMA.lifeCycle), a.lang).lower()}, "
              f"{label(g, g.value(ss, PERMA.pollination), a.lang).lower()}"
              + (", self-sows" if g.value(ss, PERMA.selfSows) and g.value(ss, PERMA.selfSows).toPython() else ""))
        print(f"  crosses with: {g.value(ss, PERMA.crossesWith)}"
              + (f"; isolate {float(iso):.0f} m" if iso is not None else ""))
        print(f"  seed stays good: {g.value(ss, PERMA.seedViabilityYears)} years; ripe here: "
              + (", ".join(names[m - 1] + str(m) for m in sorted(ripe)) if ripe else "not in this site's calendar"))
        tip = g.value(ss, RDFS.comment)
        if tip:
            print(f"  {tip}")
        print()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("calendar", help="the site's season calendar")
    c.add_argument("site")
    r = sub.add_parser("recipe", help="when a recipe comes from the site's garden, and what to buy")
    r.add_argument("recipe")
    r.add_argument("site")
    so = sub.add_parser("sow", help="what to sow or plant now on the site for the recipes you want")
    so.add_argument("site")
    so.add_argument("--month", type=int, choices=range(1, 13), help="default: this month")
    so.add_argument("--ahead", type=int, default=2, help="months to look ahead (default 2)")
    so.add_argument("--recipes", help="only these recipes, e.g. ratatouille,pistou (default: all)")
    me = sub.add_parser("menu", help="every recipe: the months it comes from the site's garden")
    me.add_argument("site")
    se = sub.add_parser("seeds", help="how to save each crop's seed, and when it is ripe on the site")
    se.add_argument("site")
    pa = sub.add_parser("pantry", help="month by month what the site's garden gives, fresh or kept")
    pa.add_argument("site")
    for p in (c, r, pa, se, me, so):
        p.add_argument("--lang", default="en", choices=["en", "de", "fr"])
    a = ap.parse_args()
    {"calendar": cmd_calendar, "recipe": cmd_recipe, "pantry": cmd_pantry, "seeds": cmd_seeds, "menu": cmd_menu, "sow": cmd_sow}[a.cmd](a)


if __name__ == "__main__":
    main()
