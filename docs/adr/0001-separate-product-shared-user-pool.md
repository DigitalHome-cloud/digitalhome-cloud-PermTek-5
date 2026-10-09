# ADR 0001 — A separate product that shares the DigitalHome.Cloud user pool

Status: **Accepted** · 2026-10-07

## Context

permaculture.digitalhome.cloud models a garden: zones, plants, species,
robots. DigitalHome.Cloud models a home: rooms, circuits, devices. They share
people (the owner, later helpers), the weather, and the platform look, but not
their data. The original build plan put the app in the DHC polyrepo on Amplify
Gen1; since then DHC moved to a Gen 2 backend in `repos/core`, and D-LAB-5 has
**template-dlab5-cloud**, which already brings tenants and spaces, the edge
device flow and one SHACL-checked A-Box per space.

## Decision

- Own repository **permaculture-cloud**, generated from template-dlab5-cloud,
  with its **own Amplify Gen 2 backend** (data, storage, functions).
- Auth is **imported** from the DHC user pool with `referenceAuth`: one
  account and one sign-in (`auth.digitalhome.cloud`) across all apps.
- The DHC Portal links to the app (a tile on the loop page, `getAppUrl`), with
  `?site=` as the cross-app parameter, like `?home=`.

## Consequences

- Permaculture models never enter the SmartHome GraphQL schema, and each
  backend deploys on its own.
- The template's `tenants` function must manage `t-…`/`s-…` groups in a pool
  it does not own: IAM on the imported pool ARN, and group names that cannot
  collide with `dhc-*`. To verify in phase 1.
- The template's rules still hold: no guest access, admin-only sign-up
  (template ADR-0002), two-step sign-in for tenant admins.
- Two backends to keep up to date instead of one; both follow the same Gen 2
  patterns (skill dhc-amplify-gen2 / dlab5-cloud-template).
