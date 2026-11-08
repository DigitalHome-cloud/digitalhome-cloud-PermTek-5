# ADR 0025 — A guild's water: parts, flows and valves

Status: **Accepted** · 2026-10-14 · Builds on [ADR 0019](0019-roofbed-wicking-bed-with-worm-box.md), [ADR 0020](0020-perma5guild-one-edge-per-guild.md)

## Context

A WormBed5's water was two numbers on its bed: how many tank pipes, how wide. The worm box's sump had "a tap"
to them. The sizing hypothesis (`docs/specs/wormbed5-sizing.md`) changed that picture in two ways:

- The bed needs rain caught from a roof, so it is not filled from the mains alone.
- The worm box makes four to six times the nutrients its bed needs. So its liquid has to be able to go
  elsewhere, for example to a tank by the fruit trees.

## Decision

1. **Water is parts and flows**, in the habitat module (`perma-habitat.ttl` v0.2):
   - a **rain catchment**: a surface with its m² and runoff share, whose gutter fills a store;
   - **water stores**: a rain barrel, the bed's tank pipes, the worm box's sump, a garden tank, each with its
     litres;
   - **valves** between two stores: a manual tap a person opens, or an edge valve the edge opens after a person
     confirmed.

   Every part belongs to a guild. A store may stand in another area than its guild, such as a garden tank in the
   garden.
2. **Each store says what it may hold**: clean water, worm liquid, or both. Worm liquid never flows into a store
   kept for clean water, such as a barrel that feeds the gantry's nozzle. This is the spec's "never on leaves" as
   data. The shapes check it in SHACL Core, so the cloud's validator and an edge's check the same. `checkHabitat`
   says it in the app.
3. **A WormBed5 starts with the same water**, sized from its bed (`packages/core/src/water.ts`):
   - 8 m² of roof into a 200 l barrel, whose tap refills the tank pipes;
   - the sump with an edge valve to the tank pipes and one to a 300 l garden tank.

   The app adds it on request; the owner then sets the real sizes.
4. **The app shows the budget** month by month from the area's climate:
   - what the planted bed uses (Hargreaves, from warmth and sun);
   - the rain on the bed;
   - the rain caught;
   - what overflows;
   - the April-to-September share rain covers.

   This is the model's number for hypothesis H7. The real bed checks it.

## Addendum, 2026-10-14: the mist line

- **A new store kind, `perma:WormBoxBin`**: the worm box's working bin. It is a place water goes to, not a store,
  so it has no litres; its moisture probe says when it needs water. It holds clean water only.
- **The WormBed5 default gains a second edge valve on the barrel**: a mist line under the box's lid, so the box
  is watered closed.
- **The barrel's tap to the tank pipes is an edge valve by default.** Low tank pipes become a proposal you
  confirm instead of a trip to the barrel. A habitat can still say `ManualTap` for a barrel without a valve.
- **The care calendar gains "Keep the worm box moist"** (`mist`, the robot, every 3 days, brought forward by a dry
  or hot box), done by the job `valve:mist`.
- **Nothing opens without a person's confirm.** The edge proposes; there is no standing permission.

## Consequences

- The edge can open the right valve: to the bed's tank, or to the garden when the bed has had its share.
- A garden-wide water system can grow from the same parts: more barrels, a pond, a drip line.
- The monthly budget hides dry spells inside a month, so it overstates what rain covers in summer. H7's
  measurement corrects it.
- Old habitats have no water parts and still load; the tank pipes on the bed stay as they were.
