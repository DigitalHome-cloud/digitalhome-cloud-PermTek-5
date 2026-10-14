# ADR 0023 — The worm population: cohorts by life stage

Status: **Accepted** · 2026-10-14 · Builds on [ADR 0019](0019-roofbed-wicking-bed-with-worm-box.md), [ADR 0020](0020-perma5guild-one-edge-per-guild.md)

## Context

The twin kept the worm box's worms as one number, grams of worm, that grew
0.8 % a day while they ate. Nothing limited it, no worm ever died of hunger,
and a closed box that lost its worms never recovered. The keeper had no rule
about the worms themselves. A question about red wigglers showed how far
that was from what is known about *Eisenia fetida*: a life cycle that hangs
on temperature, cocoons that wait out the cold, and a population that levels
off when the box gets crowded.

## Decision

1. **The worms are kept by life stage, in cohorts** (`wormbox.py` in the twin
   edge): cocoons and young in one cohort a day, each gathering warmth above
   8 °C; adults as one count. Their mass is the sum, and it is what eats.
2. **The rates come from the literature where it gives them**: laying by
   temperature (Reinecke & Kriel 1981), hatching and growing up in degree-days
   calibrated on 23 and 45 days at 22.5 °C, 2.7 young per cocoon. Crowding,
   hunger, age and the worms that leave are rules of thumb. Every number
   stands in one table at the top of the file and in
   `docs/specs/perma5guild.md`, marked "to confirm".
3. **Cohorts, not individuals.** The literature's population models of this
   worm (Johnston et al. 2014; Rakel et al. 2020) follow each worm's energy
   budget. That needs parameters nobody can check on a real box, and the twin
   steps every simulated minute at up to 600 times real time. Three stages
   driven by the same things (food, temperature, moisture, crowding) are
   enough to try rules and a feeder against.
4. **No sensor counts worms.** The population is shown as "simulation only".
   The keeper's rules about the worms ("crowded", "dying back") go by the
   feeder's estimate: eating at the best temperature divided by half the
   worms' weight.
5. **The world shows a sample.** While the lid is open, as many worms as a
   log of the real count lie on the bedding (made with Blender like the other
   shapes), in the fed half when one rests, still when the box is cold.

## Consequences

- Scenarios can show what a box does over a season: growth that levels off,
  a month without food, cocoons that wait out a cool fortnight.
- In the live run the population nearly doubled in two months and levelled
  off at about 3 kg per m², close to what practice reports. The box there is
  fed exactly what it eats; a real box will correct the numbers.
- Soil worms in the bed are not modelled. A roof bed is poor habitat for them
  (see the spec's section 6); if a figure is wanted, a soil-life index is the
  next step, not a second population.
