# WormBed5 sizing: what the worm box turns out, and whether it fits the bed

A hypothesis to measure against, in plan–do–check–act. It answers two questions before any real box has run a
season:

1. How much kitchen waste does the box turn over, and into how much liquid and castings?
2. Is the box the right size for the bed it feeds?

Every number here is a **baseline to be proved wrong**: Check compares the real box against it, and Act changes the
numbers (and the twin's model) where the box disagrees.

The example is the WormBed5 of the CityDemo habitat:

- a bed of 3.0 × 1.2 m (3.6 m²);
- a 40 cm worm box across its far end (0.48 m², sump 14.4 l);
- 3.1 m² left to plant;
- tank pipes holding 202 l.

Scale the numbers by area for other beds.

## 1. Plan: the hypotheses

Two sources give the numbers:

- **The twin's model** (`wormbox.py` in the twin edge). `scripts/wormbox-year.py` runs it through a generic Central
  European year with a helper who feeds well, adds bedding, waters and wraps the box in winter.
- **The literature and practice** (sources at the end).

Where the two disagree, the hypothesis takes a middle value and keeps the disagreement as its range.

| | What | Model (as is / worms dormant in cold) | Literature, practice | **Hypothesis** (range) |
|---|---|---|---|---|
| H1 | Food the box turns over in a year | 103 / 128 kg | 1 ft² of bin per lb of scraps a week → 2.4 kg a week for 0.48 m², over the ~30 active weeks → ~75 kg | **90 kg/yr** (60–130). About 300–700 g a day from June to September; under 50 g a day from December to February |
| H2 | Liquid to the sump, per kg eaten | 0.30 l | No measured yield found. Practice: a well-bedded bin makes little | **0.15 l/kg** (0.05–0.30) → **~14 l a year** (5–39); in summer ~0.1 l a day, never over ~0.2 l a day without rain |
| H3 | Castings, per kg eaten (moist, ~65 % water) | 0.40 kg | 86 % mass reduction of food and paper (Portsmouth); food is ~85 % water and loses half its dry matter | **0.22 kg/kg** (0.15–0.40) → **~20 kg a year** (9–52) |
| H4 | Nitrogen out of the box | — | Vegetable scraps ~0.3 % N fresh; vermicompost 1.3–3.3 % N in dry matter; ~70 % kept in castings, ~10 % in the liquid | **~3 g N per kg** of food in: ~2 g in castings, ~0.3 g in the liquid → **~200 g N a year** (110–400) |
| H5 | What the bed needs | — | Mixed vegetables ~10–11 g N/m² a year; brassicas up to ~24, beans none. Compost 1–5 kg/m² a year | **10–15 g N/m² a year → 31–47 g N** for 3.1 m². At most **~3–16 kg castings a year** |
| H6 | Who fills the box | — | EU households throw away 72 kg of food per person a year (2022); about half is raw fruit, vegetable peel, coffee and tea that worms may have | **~35 kg per person a year** → the box takes the scraps of **2–3 people** |

### What follows from them

**The liquid is no water supply.**

- H2 gives ~14 l a year, ~0.1 l a day in summer.
- The planted bed loses 3–5 mm a day in summer, about 9–16 l a day over 3.1 m².
- So the liquid is about 1 % of the water the bed uses. The tank and the refills water the bed. The liquid carries
  nutrients into the tank (H4: ~25 g N a year into 202 l), so the tank should be watched for salt (EC), not volume.

**The sump is large enough.**

- 14.4 l holds two to three months of summer liquid.
- Only rain through an open lid fills it fast (the twin's "rain in the box" scenario: 30 l an hour in a cloudburst).
  The lid switch and a monthly drain are enough.

**The box is right-sized for a household, but about four to six times too big for the bed it stands in.**

- At H1 it makes ~200 g N and ~20 kg of castings a year.
- The bed can use 31–47 g N, or up to ~10 kg of castings at the guidance rate.
- If every scoop went to this bed, it would get several times more phosphorus and salt than it needs. Penn State
  advises dosing compost by phosphorus for exactly this reason.

There are three ways out, to be decided by the measurements:

- **A.** One box per **~12–15 m² of bed**: about four such beds.
- **B.** Keep one box per bed; the bed gets **~5 kg of castings a year** (~1.6 kg/m²). The rest goes to the garden's
  fruit trees or other beds: a care-calendar task.
- **C.** Feed the box only what the bed needs: ~20–25 kg of scraps a year. This underfeeds the worms in summer and
  leaves the box cold and small in winter. It is not recommended.

**The working hypothesis is B.** The box stays as it is, because it suits the household's scraps and a smaller box
loses its warmth faster. A third of its castings goes to the bed and the rest goes out.

### What the model itself must answer for

Running the year showed three things in `wormbox.py` that the measurements must settle:

- **Cold.** The model harms the worms below 5 °C. A wrapped box on a roof sits at 4–6 °C from December to
  February, so in the model the adults die out every winter and the box restarts from cocoons each spring. Composting
  worms rest between 0 and 5 °C and die when the box freezes. `--dormant` runs the year with that, and both are in the
  table above.
- **Paper.** The worms never eat the bedding in the model, so the box fills with paper. Real worms eat it.
- **Yields.** The model's liquid (0.30) and castings (0.40) per kg eaten are at the top of the ranges above.

## 2. Do: what to measure, for one season and one winter

From April to March, beside the twin run with the same feedings (the twin is the prediction; the real box is the
measurement). Every reading is an observation (`sosa:Observation`) on the edge, as the spec asks.

| | Measure | How | How often |
|---|---|---|---|
| M1 | Scraps in, by kind | The hopper's load cell, and what the person says went in (the feeding diary) | every load (automatic) |
| M2 | How much the worms eat | The box's load cells and the feeder's rate, with the core temperature | daily (automatic) |
| M3 | Liquid out | The sump's level probe; once a month, drain the sump into a measuring jug to calibrate it. Rain through the lid is counted apart (lid switch, rain gauge) | each drain; monthly check |
| M4 | Castings out | Weigh every harvest (the robot logs its scoops; harvests by hand on a kitchen scale). Two samples a year to a lab: dry matter, total N, mineral N, P, K, EC | each harvest; 2 × a year |
| M5 | The liquid's strength | An EC meter in the sump and in the tank; one lab sample for N | monthly; once |
| M6 | What the bed does with it | Soil test in spring and autumn: mineral N, P, K, EC, organic matter. The robot's weekly photos; harvests weighed | 2 × a year; weekly; each harvest |
| M7 | Who eats here | The household's size and how much of its scraps go in versus the bin (a two-week tally) | once in summer, once in winter |

## 3. Check: when a hypothesis holds

Each month the edge sets the measures beside the hypothesis and the twin's prediction for the same feedings.

- **Holds**: the season's value lies within the range.
- **Fails**: it lies outside for two months running, or outside at the season's end.

| | Holds when |
|---|---|
| H1 | 60–130 kg eaten a year; summer days 300–700 g; winter days under 50 g |
| H2 | 0.05–0.30 l of liquid per kg eaten (without rain) |
| H3 | 0.15–0.40 kg of castings per kg eaten; lab N 1.3–3.3 % of dry matter |
| H4 / H5 | Autumn soil test: mineral N, P and EC not rising beyond the spring's when ~5 kg of castings went to the bed; plants not short of N in the photos |
| H6 | The household's suitable scraps within 25–45 kg per person a year |
| Tank | EC in the tank under ~1.5 mS/cm (above it, roots of seedlings suffer) |

## 4. Act: what changes with the answer

- **The model**: set `TO_LIQUID`, `TO_CASTINGS` and `EATS_OWN_WEIGHT_PER_DAY` from the measurements. Make the cold
  harm start at freezing if the box survives the winter. Let the worms eat bedding. Run `scripts/wormbox-year.py` again
  and update the table in section 1.
- **The sizing rule**: write the measured **m² of bed per worm box** into this spec and `roofbed-system.md`, and let
  the Map in PermTek-5 warn when a guild's bed is far off it.
- **The care calendar**: if B holds, add "take castings to the trees", with the share the soil tests allow.
- **The feeding guide**: if the tank's EC climbs, add a rule that holds the tap when the tank is salty.
- **The sump**: if M3 shows it never fills, a smaller sump is fine. If rain fills it, keep the size and add a
  lid-closed rule.

## Sources

- Eurostat: [Food waste: 132 kg per inhabitant in the EU in 2022](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20240927-2) (households 72 kg)
- NC State Extension: [Worms can recycle your garbage](https://content.ces.ncsu.edu/worms-can-recycle-your-garbage) (1 ft² of bin per lb of scraps a week)
- Oregon State Extension: [Composting with worms](https://extension.oregonstate.edu/catalog/em-9034-composting-worms)
- University of Portsmouth: [Vermicomposting of biodegradable wastes: effects of varying feedstocks and process conditions](https://researchportal.port.ac.uk/en/publications/vermicomposting-of-biodegradable-wastes-effects-ofvarying-feedsto/) (86 % mass reduction; reducing leachate)
- [Transformation of nutrients and organic matter in vermicomposting of sewage sludge and kitchen wastes](https://ideas.repec.org/a/ibn/jasjnl/v6y2014i2p114.html); [Study on the production of vermicompost from food wastes](https://meral.edu.mm/record/2303/files/Study%20on%20the%20production%20of%20Vermicompost%20from%20Food%20Wastes.pdf) (N 3.3 % and 1.32 %)
- Cornell: [Vegetable info sheet](https://bpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/3/72/files/2016/07/Veggie-Info-Sheet-2016-1jsq90e.pdf) (about 3.5 oz N per 100 ft² a year; by crop)
- Colorado State Extension: [Vegetable gardening nitrogen recommendations](https://extension.colostate.edu/resource/vegetable-gardening-nitrogen-recommendations)
- Penn State Extension: [Less is more: how to apply compost in your vegetable garden](https://extension.psu.edu/less-is-more-how-to-apply-compost-in-your-vegetable-garden) (dose by phosphorus)
- IDELUX: [Compost vert, conseils](https://www.idelux.be/sites/default/files/2023-02/FLYER_A4_Compost-vert_Conseils-et-compositions-2023.pdf) (1–5 kg/m² a year)
