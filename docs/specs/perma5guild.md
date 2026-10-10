# Perma5Guild: the product structure

Status: **foundation; the twin implements it step by step** · ADR 0020

A Perma5Guild is an area's working unit: bed(s), worm box, tank, sensors and
robot(s), kept and run together. This document is what every guild type
shares. The first type, **WormBed5**, is built up in `roofbed-system.md`; its
robot, **Gantry5-gen1**, in `roofbed-robot.md`.

```
Site (one per home)
└─ Area (roof, garden, balcony)
   └─ Perma5Guild   type WormBed5 · robot Gantry5-gen1 · one edge
      ├─ growing bed (cells: planned → sown → growing → harvested)
      ├─ worm box   (scraps in; castings, liquid, worms, a little heat out)
      ├─ tank       (clean water and the worm box's liquid, given from below)
      ├─ sensors    (fixed: over time · on the robot: over space)
      └─ robot      (sows, waters, probes, photographs, feeds the worms, weeds)
```

## 1. Type and instance

| | Fixed by the guild **type** | Set per **instance** |
|---|---|---|
| Parts | bed, worm box, tank, robot, sensor set | length, width, depth, substrate, tank pipes, worm box length |
| Jobs | plant, water, probe, photograph, feed the worms, stamp weeds | which cells, how much, when |
| Rules | what is watched and how the guild reacts | thresholds tuned to the place |
| Scenarios | the walkthroughs and chaos runs that apply | — |

## 2. What is observed

Fixed sensors for what changes over **time**; the robot's probe and camera for
what changes over **space**. Every reading is an observation
(`sosa:Observation`) about the guild, the bed, a cell or the worm box.

| About | Reading | Why |
|---|---|---|
| Worm box | temperature, core and edge | survival; a rising core means too much food heating up |
| Worm box | moisture | too dry and they stop; too wet and it goes airless |
| Worm box | weight | how fast food disappears: the real feeding rate |
| Worm box | liquid level and flow out | is it draining; how much reaches the bed |
| Worm box | gas (ammonia or CO₂) | early sign of an airless, overfed box |
| Worm box | acidity, now and then | sour from too much fruit |
| Worm box | camera on the surface | uneaten food, mould, flies, worms trying to leave |
| Tank | level | refill in time; overflow after rain |
| Bed | soil moisture at depth, 2 or 3 places | is the wick working |
| Bed | per cell: moisture, temperature, salt content | dry spots; over-fed spots near the box |
| Bed | camera pass | germination, growth, weeds, bare soil |
| Around | air temperature, sun, rain, wind | frost, heat, storm; the context for everything else |
| Devices | hopper weight, lid state, leak, robot position | what was fed; is it safe to move |

## 3. Algorithms, simplest first

Each rung works without the ones above it, and offline. A higher rung may
propose; it never removes a lower rung's safety reaction.

1. **Rules with thresholds and hysteresis** (the keeper). Frost or heat at the
   worm box, storm wind, an empty tank, a dead sensor. Always on.
2. **Mass balance.** Weight lost per day is what the worms ate: feed that
   much, corrected for temperature. An adaptive feeder with no training.
3. **Forecast-aware rules.** The home's postal-area weather forecast lets the
   guild act before a cold night or a heat wave.
4. **Anomaly detection.** A reading that leaves its usual daily pattern, or
   does not move at all.
5. **Vision without training.** The planting grid is known, so green that is
   not at a planted point is a weed; soil that shows is bare.
6. **Small trained models**, only where rules fail: a seedling against a weed
   at the same spot; mould against food.
7. **The chat agent.** It explains and proposes. It never acts alone.

### The worm box model the twin tries these against

The twin plays the worm box with a small model (`wormbox.py` in the twin
edge). Its numbers are rules of thumb from composting practice, not
measurements of a real box. They are written here so they can be corrected
when a real box says otherwise.

| Rule of thumb | Value in the twin |
|---|---|
| Worms eat, at their best | half their own weight a day |
| They work best at | 15 to 25 °C in the core, 65 to 85 % moisture |
| They stop | under 4 °C and over 32 °C |
| Of what is eaten | 40 % stays as castings, 30 % drains as liquid, 30 % leaves as gas and vapour |
| So the box loses | 0.6 g for every gram eaten (what the feeder measures) |
| Uneaten food heats the core | about 2.5 °C per kg |
| The box follows the air | with a delay of about 3 hours; wrapped, about 15 |
| The air in the box runs short | from 1.5 kg of uneaten food, or above 85 % moisture |
| Stress that wears the worms down | core under 5 °C or over 30 °C, moisture under 45 % or over 92 %, no air |
| Worms that may leave | dodge half the harm and come back; in a closed box what is lost stays lost |

The last row is a simplification. A closed box does recover in reality, from
cocoons, over weeks.

**The feeder (rung 2), step by step.** It takes the box's weight at every
look, minus what the robot has fed. It fits a straight line through the last
day of that series, so the load cells' noise averages out; the slope divided
by 0.6 is what the worms eat per day. It scales that rate to the box's
temperature now, keeps count of what was fed and eaten since, and proposes
what brings the uneaten food up to one day's eating. With less than six hours
of readings it is learning and gives small portions only. When the weight
jumps for a reason it does not know (bedding added, food taken out) it starts
over. Without a weight or temperature reading it proposes nothing.

What it cannot know: food that was in the box before it started counting.
The keeper's own rules (core much hotter than edge, the gas sensor) guard
that side.

## 4. Chaos monkeys

A guild lives outdoors. The twin injects disturbances, and each has a
reaction the guild owes. A chaos run is a test with a score.

| Disturbance | What happens | The guild owes |
|---|---|---|
| Cold snap | air drops below freezing within hours | stop feeding; tell the person to insulate; no watering |
| Heat wave | days above 30 °C | stop feeding; tell the person to shade and wet the box's top |
| Cloudburst | the tank fills to its overflow | check the overflow; no watering |
| Storm wind | gusts above the gantry's limit | park and lock the gantry out until it passes |
| Empty tank | nobody refilled | tell the person; water what was just sown from above |
| Tank leak | level falls without use | tell the person at once |
| Sensor stuck or dead | a reading freezes or disappears | distrust it, say so, fall back to the safe side |
| Hopper jam | the scoop comes back empty | stop feeding; tell the person |
| Overfeeding | far more food than the worms eat | stop feeding; tell the person to take food out and add dry bedding |
| Lid left open | the box dries, cools faster, rain gets in | tell the person |
| Network loss | no link to the cloud | keep working; queue what is to be written back |
| Weeds | green off the planted points | scan; stamp the small ones; flag the large |

## 5. Soil cover and weeds

- **No bare soil.** What the crops leave free is sown with a cover crop
  (white clover, phacelia, mustard: `perma:coverCrop` in the library); the
  planting suggestion does that when asked. Or the bed carries a thin mulch
  (`perma:mulchCm`). A thick mulch is avoided on a robot bed: above about
  3 cm it stops a seeder and hides the soil from the camera.
- **The robot looks the bed over** (`scan_weeds`): the tool camera looks
  straight down from a known height, so a pixel is a place in the bed. Leaf
  green that is not where something was planted is a weed. No trained model.
  In the twin a look over a 3 × 1.2 m bed is 27 pictures and takes about a
  minute; it found every weed within a few millimetres of where it stood.
- **Small weeds are pressed into the soil** with a stamp tool (`stamp_weeds`),
  where they feed soil life. No gripper is needed. Small means under 30 mm
  across; the stamp stays 3 cm away from where any plant reaches.
- **The others are for a person**: weeds too big to stamp, and small ones too
  close to a plant. They may go to the worm box only when they carry no seed
  and are not creeping roots: a worm box does not get hot enough to kill seeds.
- **What the scan cannot do:** see a weed under a grown plant's leaves, or tell
  a weed from a crop of the same colour standing at a planted point.

## 6. Worms: free or contained

A guild setting (`perma:wormsMayLeave`), not a verdict.

| | Exits into the soil | Closed box |
|---|---|---|
| Survival | a refuge when the box turns too hot, cold or sour | they die if the box fails |
| Measuring | weight and population are less exact | a clean mass balance |
| Soil | worms carry compost and air into the bed | only the liquid reaches the bed |
| Fit | compost worms live in rich litter; a mineral roof substrate is poor habitat, so they stay near the box | no such question |

The default is an exit with mulch beside it. Whether the worms use it is for a
season on a real bed to show; the twin can only simulate both.
