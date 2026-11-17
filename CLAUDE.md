# CLAUDE.md — PermTek-5

The owner works in EN / DE / FR; answer in English unless they switch. Simple solutions, no over-engineering, no marketing tone; explain
changes in plain words.

## What this is

PermTek-5, permaculture on DigitalHome.Cloud. A repository made from template-dlab5-cloud
(load the `dlab5-cloud-template` skill for its constraints), plus the ontology and the Webots twin.
The cloud is at the root (`backend/`, `packages/`); the nest edge gets its own repository. **This repository is public**: it must never contain anything
that locates a real site.

## Read first

`README.md` → `docs/workflow.md` → `docs/build-plan.md` → `docs/adr/` → `twin/CLAUDE.md` when working on the twin.

## Rules

1. **Observe before acting**: the app and agents suggest, a person accepts.
2. **The garden runs offline**: the nest coordinates; the cloud is archive, design and review.
3. **Reuse, don't rebuild**: template-dlab5-cloud for the cloud, template-dlab5-edge for the nest
   (skills `dlab5-cloud-edge-blueprint`, `dlab5-cloud-template`, `dlab5-edge-template`).
   DHC provides the user pool, the Portal and the weather; permaculture data never goes into the DHC backend.
4. **Code public, site private** (ADR 0013): nothing that locates a real site, anywhere in this repo:
   no site names, commune, coordinates, elevations, plans, traced outlines, calendars or site notes.
   Those live in a private site pack outside this repository. `scripts/check-public.sh` (pre-commit)
   checks the whole tree against a private denylist (`~/.config/permaculture/denylist`).
5. **Same look as the Portal**: palette, fonts and the Observe/Design/Build/Run loop per `docs/design-identity.md`.
6. **No double maintenance**: platform-wide things (tokens, environment service) belong in DHC; link, don't copy.
7. **Sign-in is the DHC pool** (ADR 0008): never commit its ids or ARNs; they are looked up from DHC core
   at deploy time (backend/scripts/dhc-auth-env.mjs, docs/setup/shared-auth.md). Operators are `dhc-admins`; TOTP is DHC core's adminMfaGate.
8. Repository naming: `-user-` not `-operator-`, `-management-` not `-design-`.

## Layout

```
docs/workflow.md          the story: create, desk, frame, build, explore, observe, loop
docs/build-plan.md        the plan (revised; original in the first commit)
docs/architecture.md      parts, flows, where things live
docs/privacy-contract.md  what never leaves the nest / never goes public
docs/design-identity.md   Portal palette → template tokens, the loop
docs/adr/                 0008–0014
docs/plans/               step plans (twin step 1: ROS 2 rover)
packages/backend/                  Amplify Gen 2 backend (not a workspace); auth = referenceAuth to the DHC pool
packages/                 site, core, i18n (EN/DE/FR), ontology (perma-core modules + tools + tests)
twin/                     Webots test bed, GPL; generated from a site file
```

## Never commit

`.env*`, `amplify_outputs.json`, `src/aws-exports.js`; under `twin/`: `worlds/`,
`site_config.json`, `data/`, plans, anything from the private site pack.
