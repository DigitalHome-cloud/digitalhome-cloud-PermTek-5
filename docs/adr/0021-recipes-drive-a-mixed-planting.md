# ADR 0021 — Recipes drive the planting, and a bed is planted mixed

Status: **Accepted** · 2026-10-10 · Builds on [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0020](0020-perma5guild-one-edge-per-guild.md)

## Context

A garden is planted for two reasons that belong together: for the place, and
for the people who eat from it. So far the app knew crops and a calendar, and
recipes existed only as files in the repository. Two things were missing.

- **What to plant.** A household knows what it likes to cook. From its recipes
  follows which crops it wants, and which ingredients it will always buy.
- **Where to plant it.** The demo bed was drawn in tidy blocks: nine lettuces,
  a row of radish. Permaculture plants mixed: neighbours are chosen by what
  they take from the soil and what they give to it. The word "guild" comes
  from there (a tree with the plants that serve it); our Perma5Guild borrowed
  it for the bed with its worm box and robot.

## Decision

1. **A household keeps its own recipes in its space's graph**, as
   `schema:Recipe` with one `perma:IngredientUse` per line
   (`packages/core/src/habitatGraph.ts`). A line keeps its text as written;
   where it names a crop of the library it links to it, with the part and the
   way it arrives (fresh, dried, pickled). Lines without a crop are bought.
2. **The shared recipes stay files** (`packages/ontology/abox/recipes/`), the
   same for everyone, and the app offers them to take over.
3. **A pasted list of ingredients becomes a recipe**: every line is matched
   to a crop by name in French, English or German (`parseIngredients()`), and
   a person checks the matches before saving.
4. **The crop library says what each herbaceous crop takes and gives**
   (`perma:feeding`, `perma:rootDepth`, `perma:heightCm`, `perma:gives`,
   `dwc:family`, `perma:goodNeighbour`, `perma:badNeighbour`).
5. **The app suggests a mixed planting** (`packages/core/src/planting.ts`):
   - `plantCounts()`: every wanted crop that fits gets a plant, and the rest
     of the bed is shared by area, weighted by how many recipes want the crop.
   - `suggestPlanting()`: every plant keeps its spacing; good neighbours go
     side by side and bad ones apart; a heavy feeder gets a soil builder
     beside it; roots at different depths sit together; relatives and the
     same crop are spread; tall crops go to one long side; heavy feeders sit
     nearer the worm box.
   - `scorePlanting()` reads any planting the same way, so a bed as drawn can
     be compared with a suggestion.
6. **It is a suggestion** (rule 1): the person sees it on the bed, can ask
   for another arrangement, and accepts it or not. Accepted plants are
   planned cells; nothing is sown by that.
7. **The cloud checks a graph against the crop library too**, so a recipe
   line or a cell cannot point at a crop that does not exist.

## Is a 3 × 1 m bed too small for this?

No. With the worm box it has about 2.6 m² of soil, 260 cells of 10 cm. The
two recipes "Burger aux carottes" and "Salade du toit" ask for 13 crops that
grow in a bed; with bush beans and marigolds as helpers the suggestion places
about 170 plants of 15 crops, with no bad neighbours side by side. What a bed
this size cannot hold is a guild in the first sense, a tree with its
companions; that belongs to the garden area. And one cucumber or one pepper
plant is all there is room for.

## Consequences

- The companion attributes are **traditional guidance**. Evidence for single
  pairings is mixed, and every statement is "to confirm". The app says so
  beside each suggestion. The weights in `planting.ts` are a first guess.
- The suggestion does not know the season: whether each crop can be sown now
  is the calendar's. It does not yet plan a succession through the year, nor
  a rotation from one year to the next; the family attribute is there for it.
- About a tenth of the bed stays unplanted and tends to lie together at one
  end. Cover crops for those gaps come with the soil-cover work.
- Seven crops (onion, garlic, cabbage and others) gained sowing and spacing
  data so they can be placed; the calendar now derives months for them too.
- The twin edge reads the same library, so it can sow what a suggestion plans.
- The robot does not yet use the mixed layout for anything beyond sowing each
  cell; top-dressing heavy feeders first would be a next step.
