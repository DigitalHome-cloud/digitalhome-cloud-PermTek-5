# CLAUDE.md — PermTek-5

The owner works in EN / DE / FR; answer in English unless they switch. Simple solutions, no over-engineering, no marketing tone; explain
changes in plain words.

## What this is

PermTek-5, permaculture on DigitalHome.Cloud: docs, ADRs, the ontology and the Webots twin.
Cloud and nest repos are generated later into `repos/` (see the build plan's
roadmap, phase 1). **This repository is public**: it must never contain anything
that locates a real site.

## Read first

`README.md` → `docs/workflow.md` → `docs/build-plan.md` → `docs/adr/` → `twin/CLAUDE.md` when working on the twin.

## Rules

1. **Observe before acting**: the app and agents suggest, a person accepts.
2. **The garden runs offline**: the nest coordinates; the cloud is archive, design and review.
3. **Reuse, don't rebuild**: template-dlab5-cloud for the cloud, template-dlab5-edge for the nest
   (skills `dlab5-cloud-edge-blueprint`, `dlab5-cloud-template`, `dlab5-edge-template`).
   DHC provides the user pool, the Portal and the weather; permaculture data never goes into the DHC backend.
4. **Code public, site private** (ADR 0006): nothing that locates a real site, anywhere in this repo:
   no site names, commune, coordinates, elevations, plans, traced outlines, calendars or site notes.
   Those live in a private site pack outside this repository. `scripts/check-public.sh` (pre-commit)
   checks the whole tree against a private denylist (`~/.config/permaculture/denylist`).
5. **Same look as the Portal**: palette, fonts and the Observe/Design/Build/Run loop per `docs/design-identity.md`.
6. **No double maintenance**: platform-wide things (tokens, environment service) belong in DHC; link, don't copy.
7. Repository naming: `-user-` not `-operator-`, `-management-` not `-design-`.

## Layout

```
docs/workflow.md          the story: create, desk, frame, build, explore, observe, loop
docs/build-plan.md        the plan (revised; original in the first commit)
docs/architecture.md      parts, flows, where things live
docs/privacy-contract.md  what never leaves the nest / never goes public
docs/design-identity.md   Portal palette → template tokens, the loop
docs/adr/                 0001–0007
docs/plans/               step plans (twin step 1: ROS 2 rover)
ontology/                 perma-core modules: vegetation, crops, seasons, recipes; tools; tests
twin/                     Webots test bed, GPL; generated from a site file
repos/                    cloud and nest repos, once generated
```

## Never commit

`.env*`, `amplify_outputs.json`, `src/aws-exports.js`; under `twin/`: `worlds/`,
`site_config.json`, `data/`, plans, anything from the private site pack.
