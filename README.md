# PermTek-5

Permaculture on the DigitalHome.Cloud platform.

A garden as a living model: its zones and plants, every plant and animal
detected there, what the robots observed, and which interventions are
suggested. Multi-site from day one: real sites stay private; **PermaDemo**,
an invented hillside garden, is public for study and testing.

The product follows the same loop as the DigitalHome.Cloud Portal:
**Observe → Design → Build → Run** (check, plan, do, act).

It is a D-LAB-5 cloud-and-edge product, separate from the SmartHome but on the
same platform: one login (the DHC user pool), a tile on the Portal, and weather
from the shared DHC environment service.

| Part | Where | Made from |
|---|---|---|
| Cloud: the app (Gatsby 5) | `packages/site`, `packages/core`, `packages/i18n` | template-dlab5-cloud |
| Cloud: the backend (Amplify Gen 2) | `backend/` (not a workspace, ADR-0001) | template-dlab5-cloud, sign-in through the DHC pool (ADR 0008) |
| Ontology: crops, seasons, recipes, vegetation | `packages/ontology` | perma-core modules, SHACL; the template's placeholder T-Box until it is replaced |
| Twin: Webots test bed | `twin/` | this project, GPL-3.0-or-later |
| Nest: the garden's edge | its own repository (to generate) | template-dlab5-edge, `edge_kind=iot` |

**Public, without any real site.** Site names, plans, coordinates, calendars and
site files live in a private site pack, never here (ADR 0013).
`scripts/check-public.sh` runs before every commit.

## Develop

```bash
npm install && npm --prefix backend install     # two installs: backend/ is not a workspace
npm test && npm run backend:typecheck
npm run build                                   # must pass with no amplify_outputs.json
npm run dev                                     # sandbox + site; first export AMPLIFY_BACKEND_APP_ID/_BRANCH
                                                # of DHC core (docs/setup/shared-auth.md)
```

Branches: `stage` integrates, `main` is production (Amplify app
`digitalhome-cloud-PermTek-5`). Guidance for working in a repository made from
the template: the `dlab5-cloud-template` skill. The template's ADRs are
`docs/adr/0001`–`0007`, PermTek-5's start at `0008`.

## Read first

- [docs/workflow.md](docs/workflow.md): the story, from a new site to a running garden
- [docs/build-plan.md](docs/build-plan.md): goal, screens, register, stack, roadmap, open decisions
- [docs/architecture.md](docs/architecture.md): garden · nest · cloud · twin · DHC
- [docs/privacy-contract.md](docs/privacy-contract.md): what never leaves the nest or reaches a public repo
- [docs/design-identity.md](docs/design-identity.md): the Portal's look and the loop
- [docs/adr/](docs/adr/): decisions 0001–0018 (0001–0007: the template's; 0015: a tenant is the habitat of a DHC home; 0016: the habitat model; 0017: the roof-bed gantry; 0018: its twin edge)
- [docs/specs/roofbed-robot.md](docs/specs/roofbed-robot.md): design of the gantry robot for a roof bed
- [packages/ontology/README.md](packages/ontology/README.md): crop library, site calendars, recipes, vegetation map
- [twin/README.md](twin/README.md): the Webots twin
- [twin/README.md](twin/README.md): run the twin on the demo site

## Licence

Code GPL-3.0-or-later (see `LICENSE`, `COPYRIGHT`, `NOTICE`); the invented sites and examples are CC0.
