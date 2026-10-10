# ADR 0019 — The roof bed feeds itself: a worm box at one end, its liquid given from below

Status: **Accepted (design; nothing built yet)** · 2026-10-10 · Builds on [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0017](0017-roofbed-gantry-is-a-robot-edge.md)

## Context

A permaculture bed should close its own loop: kitchen scraps become compost
and feed the plants. On a roof, weight is the hard limit, and the first
calculation showed that the intuitive design (drain pipes under the bed as
the water tank) is the heavy one: a tank layer adds 50 to 110 kg/m². It also
showed that the layer's height sets the weight, not the number of pipes:
water is lighter than wet substrate, so the layer should be packed with pipes.

## Decision

1. **A worm compost box takes the bed's far end** (`perma:wormBinCm`). The
   gantry feeds it from a hopper a person fills. No cells are planted there.
2. **Its liquid reaches the plants from below, by gravity, never on leaves.**
   Two builds, both flat on the roof:
   - **A, plain bed**: no tank under the bed; a buried perforated line
     spreads the liquid in the root zone; clean water stands elsewhere.
   - **B, wicking bed**: perforated drain pipes under the substrate hold the
     water and the liquid; substrate between them wicks it up; an overflow
     at the top of the tank layer lets rain out.
   A bed says which it is by its number of tank pipes (0 or more).
3. **The app shows every bed's wet weight** (`bedLoad()`), in kg and kg/m²,
   with how that reads against what roofs are often built for. It never says
   a roof is strong enough.
4. **The first bed is planned at 15 cm of lightweight roof substrate.** Whether
   it is build A (191 kg/m²) or B (242 to 304 kg/m²) waits for the roof check.
5. **Fixed sensors for what changes over time** (tank level, compost and soil
   at depth, air, wind, leak), **the gantry's probe and camera for what
   changes over space** (a map per cell). `docs/specs/roofbed-system.md`.

## Consequences

- No design here suits a roof built for only about 100 kg/m² of added load.
  That is a finding, not a gap to engineer around.
- The twin simulates the worm box, the tank and a `feed_worms` job before any
  hardware (ADR 0018).
- Sensor readings are described but not yet stored in the cloud.
- The worm box is the part most exposed to the roof's climate: it needs
  shade and insulation, and may have to move indoors in winter.
