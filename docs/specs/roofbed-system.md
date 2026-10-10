# The roof bed as a system: soil, water, worms, sensors

Status: **design, nothing built** · ADR 0019 · model: ADR 0016 · robot: `roofbed-robot.md`

A growing bed that stands flat on a roof, feeds itself from a worm compost
box at one end, and is worked by the gantry. This document says how it is
built up, how heavy it gets, how the worm box's liquid reaches the plants,
and what is measured.

> **The roof decides, not this document.** Every weight here is an estimate
> from typical densities. What a roof may carry is in the building's documents
> or with a structural engineer. Nothing is built before that is checked.

## 1. How heavy

A wet bed is heavy, and a roof has to carry it wet. The numbers come from
`bedLoad()` in `packages/core/src/bedLoad.ts` (a test keeps this table equal
to it). They include the frame, a 40 kg gantry and, where named, a 40 cm worm
box.

<!-- weights:start (packages/core/__tests__/bedLoad.test.mjs prints and checks this) -->
| Bed, 3 × 1 m | Tank | Lightweight roof substrate | Garden soil |
|---|---|---|---|
| 10 cm, no tank | 0 l | 390 kg · 130 kg/m² | 600 kg · 200 kg/m² |
| 15 cm, no tank, worm box | 0 l | 574 kg · 191 kg/m² | 847 kg · 282 kg/m² |
| 15 cm, 14 × 50 mm pipes, worm box | 73 l | 727 kg · 242 kg/m² | 1047 kg · 349 kg/m² |
| 15 cm, 10 × 75 mm pipes, worm box | 117 l | 801 kg · 267 kg/m² | 1139 kg · 380 kg/m² |
| 15 cm, 6 × 110 mm pipes, worm box | 151 l | 913 kg · 304 kg/m² | 1297 kg · 432 kg/m² |
| 25 cm, 6 × 110 mm pipes, worm box | 151 l | 1211 kg · 404 kg/m² | 1777 kg · 592 kg/m² |
| 35 cm, 6 × 110 mm pipes, worm box | 151 l | 1509 kg · 503 kg/m² | 2257 kg · 752 kg/m² |
<!-- weights:end -->

How to read it:

- **Many flat roofs that are not terraces are built for about 100 kg/m² on top
  of their own weight** (snow, a person doing maintenance). No bed with a
  useful depth of soil is that light: even 10 cm of lightweight substrate is
  130 kg/m².
- **Roofs built as terraces often allow 250 to 400 kg/m².** The plain 15 cm
  bed (191 kg/m²) fits the lower end; a wicking bed with a tank under it
  (242 to 304 kg/m²) needs the middle or the upper end.
- **A tank layer costs by its height, not by its pipes.** Water is a little
  lighter than wet substrate, so every pipe added to the layer replaces
  substrate with water: ten 75 mm pipes hold 117 litres and weigh no more
  than three. A tank layer should be packed with pipes, leaving about a
  quarter of the width as wick. Thin pipes give the lightest bed (50 mm:
  242 kg/m² for 73 litres), thick ones the most water (110 mm: 304 kg/m² for
  151 litres).
- **A tank under the bed is never free**: the lightest one adds about 50
  kg/m² to the plain bed.
- **Garden soil is about 60 % heavier** than a lightweight roof substrate.
  On a roof, use the roof substrate.

Assumed: saturated density 1100 kg/m³ (lightweight roof substrate), 1800
(garden soil), 900 (potting compost); a pipe's bore is 94 % of its outer
diameter; worm box 35 cm high, 70 % full, 800 kg/m³; 30 mm softwood frame.

## 2. How deep

| Substrate | Grows well (general practice) |
|---|---|
| 10 to 15 cm | lettuce, rocket, radish, spinach, spring onion, chives, parsley |
| 25 cm | the above, plus Swiss chard, basil, dwarf tomatoes |
| 35 cm | full-size tomatoes, courgette, aubergine, sweet pepper |

The first bed is planned at **15 cm**: it carries the salad crops the roof
bed is for, at the lowest weight that still does.

## 3. Two builds

Both stand **flat on the roof**: a protection mat on the membrane, boards
under the frame to spread the load, nothing on legs. Flat is the most stable
in wind and loads the roof evenly. Keep the roof's drain and the membrane's
upstands free and reachable.

### A. Plain bed with a buried line (the light one: 191 kg/m²)

Bottom to top: protection mat · boards · frame and liner with drain holes ·
15 cm substrate · mulch. **No tank under the bed.** One perforated pipe is
buried in the substrate along the bed, fed from the worm box's sump: it
spreads the liquid below the surface. Clean water comes from a tank that
stands somewhere the building carries it (over a wall, on the ground), not on
the bed's footprint.

### B. Wicking bed with tank pipes (242 to 304 kg/m²)

Bottom to top: protection mat · boards · frame · watertight liner · **tank
layer**: standard perforated drain pipes (50, 75 or 110 mm) laid side by side
along the bed, capped, with substrate packed in the gaps as the wick · separation fabric ·
15 cm substrate · mulch.

- A **fill pipe** reaches the tank from above; a dipstick or sensor shows the level.
- An **overflow outlet at the top of the tank layer** is essential on a roof:
  rain must leave, or the bed floods and gets heavier than planned.
- The soil draws water up about 30 cm at most, so the substrate above the tank
  stays within that.

In the model a bed says which it is: `perma:tankPipeCount` 0 (A) or more (B),
`perma:tankPipeMm`, `perma:substrateKind`, `perma:substrateDepthCm`.

## 4. The worm box

At the bed's far end, across its width (`perma:wormBinCm`, 40 cm in the
reference). No cells are planted there.

- **Box**: insulated walls and lid, shaded, about 35 cm high. A perforated
  base lets liquid drain down and lets worms move into the bed's soil and back.
- **Worms**: compost worms (*Eisenia fetida*). They work between roughly 5 and
  30 °C and best around 15 to 25 °C.
- **In**: raw fruit and vegetable scraps, coffee grounds, tea leaves, torn
  paper and cardboard. **Not in**: meat, fish, dairy, oil, cooked food, and
  only little citrus and onion.
- **How much**: a settled box is commonly said to take up to half the worms'
  own weight a day. Start with much less and watch: uneaten food and a smell
  mean too much.
- **Summer on a roof**: the box overheats first. Shade, a light-coloured lid,
  a moist top layer; above about 30 °C the worms leave or die.
- **Winter**: below about 5 °C they stop. Insulate and stop feeding; a frozen
  box is lost. In a hard winter the worms move indoors in a bucket.

## 5. The liquid loop

```
kitchen scraps -> hopper -> (gantry) -> worm box
                                          | liquid drains down
                              A: sump -> buried line -> root zone
                              B: tank pipes -> wick -> root zone
                                          | too much (rain)
                                       overflow -> roof drain
```

- **From below, by gravity.** No pump in the loop. The liquid mixes with the
  tank's water (B) or soaks in along the buried line (A).
- **Never on leaves.** The liquid is drainage from fresh compost, not a
  finished product: it stays below the surface and never touches salad that
  is eaten raw. Wash what is harvested.
- **From above: clean water only**, with the gantry's nozzle, for seeds and
  seedlings whose roots do not reach the moist layer yet.
- **Maintenance**: once or twice a year the sump and pipes are flushed
  through their end caps; a foul smell means the tank went airless and is
  emptied and refilled.
- **Too much liquid** (a wet summer) leaves by the overflow. It is nutrient
  rich: where the roof drain goes to a rain barrel, that is where it should
  go, not to the sewer.

## 6. Sensors

Fixed where a value changes over time; on the gantry where it changes over space.

| Sensor | Where | For | Who acts |
|---|---|---|---|
| Tank level | fixed, in the fill pipe (B) or the sump (A) | refill before it is empty; overflow check after rain | person refills; the edge says when |
| Compost temperature | fixed, two probes in the worm box | too hot, too cold, or heating up (too much food) | edge warns; person shades, insulates, stops feeding |
| Compost moisture | fixed, in the worm box | too dry (add water) or sodden (add paper) | person |
| Soil moisture at depth | fixed, two or three probes along the bed | is the wick working; when to refill | edge proposes top-watering; person refills |
| Air temperature, wind | fixed, on the frame | frost and heat alerts; no gantry motion in strong wind | edge locks out the gantry |
| Leak | fixed, under the liner's low corner | water on the roof | person, at once |
| Soil moisture, temperature, salt content | on the gantry (probe) | a map per cell: dry spots, over-fed spots near the box | edge proposes; person confirms |
| Camera | on the gantry | germination, growth, pests; the worm box's surface | person reviews |
| Weight of the hopper | fixed, a load cell | how much was fed, and when | edge logs |

Readings are `sosa:Observation`s about the bed, a cell or the worm box. Raw
camera frames beyond the pictures chosen for upload stay on the edge.

## 7. What the robot does, and does not

- **Feeds the worms** (`feed_worms`): a person fills the hopper at the bed's
  near end; the gantry carries portions to the worm box and spreads them in
  rotation, so no corner is overloaded; each feeding is logged. The lid is
  opened by the gantry's tool or stays open under a rain cover.
- **Waters from above** with clean water where seedlings need it.
- **Probes and photographs** cells and the worm box's surface.
- **Does not** refill the tank, empty the box, harvest castings or flush the
  pipes: those are a person's, a few times a year.
- Every job is a proposal a person confirms, as before (ADR 0017).

## 8. Open questions

- What the roof may carry: decides A or B, and the depth.
- The lid: opened by the gantry, or a fixed rain cover with an open slot?
- A scoop or a small conveyor for the hopper?
- How salty does the soil near the box get over a season (the gantry's probe
  will show it)?
- Winter: leave the box on the roof, or carry the worms indoors?
