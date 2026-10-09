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
| Cloud: app and backend | `repos/permaculture-cloud` (to generate) | template-dlab5-cloud (Amplify Gen 2) |
| Nest: the garden's edge | `repos/permaculture-nest-edge` (to generate) | template-dlab5-edge, `edge_kind=iot` |
| Twin: Webots test bed | `twin/` | this project, GPL-3.0-or-later |
| Ontology: crops, seasons, recipes, vegetation | `ontology/` | perma-core modules, SHACL |

**Public, without any real site.** Site names, plans, coordinates, calendars and
site files live in a private site pack, never here (ADR 0006).
`scripts/check-public.sh` runs before every commit.

## Read first

- [docs/workflow.md](docs/workflow.md): the story, from a new site to a running garden
- [docs/build-plan.md](docs/build-plan.md): goal, screens, register, stack, roadmap, open decisions
- [docs/architecture.md](docs/architecture.md): garden · nest · cloud · twin · DHC
- [docs/privacy-contract.md](docs/privacy-contract.md): what never leaves the nest or reaches a public repo
- [docs/design-identity.md](docs/design-identity.md): the Portal's look and the loop
- [docs/adr/](docs/adr/): decisions 0001–0007
- [ontology/README.md](ontology/README.md): crop library, site calendars, recipes, vegetation map
- [twin/README.md](twin/README.md): the Webots twin
- [twin/README.md](twin/README.md): run the twin on the demo site

## Licence

Code GPL-3.0-or-later (see `twin/LICENSE`); the invented sites and examples are CC0.
