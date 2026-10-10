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
| Network loss | no link to the cloud | keep working; queue what is to be written back |
| Weeds | green off the planted points | scan; stamp the small ones; flag the large |

## 5. Soil cover and weeds

- **No bare soil.** Empty cells get a cover crop (clover, phacelia, mustard) or
  a thin mulch. A thick mulch is avoided on a robot bed: it stops a seeder and
  hides the soil from the camera.
- **Small weeds are pressed into the soil** with a stamp tool, where they feed
  soil life. No gripper is needed.
- **Larger weeds are flagged for a person.** They may go to the worm box only
  when they carry no seed and are not creeping roots: a worm box does not get
  hot enough to kill seeds.

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
