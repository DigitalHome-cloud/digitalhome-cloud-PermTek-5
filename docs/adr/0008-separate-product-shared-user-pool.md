# ADR 0008 — A separate product that shares the DigitalHome.Cloud user pool

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

## Amendment (2026-10-09): how the pool is shared

Built from template-dlab5-cloud (ADRs 0001-0007 in this folder are the
template's). `backend/amplify/auth/resource.ts` uses `referenceAuth` with the DHC
pool; its six identifiers come from the environment (docs/setup/shared-auth.md),
never from this public repository.

Where this departs from the template's own pool:

- **Sign-up is open** in the DHC pool (the template's ADR-0002 closes it). A
  signed-in DHC user sees nothing here until a tenant admin adds them to a
  site's group; no rule in PermTek-5 grants "any signed-in user".
- **Operators are `dhc-admins`**, the platform admins, not a PermTek group.
- **Two-step sign-in** comes from DHC core (PR #12): MFA OPTIONAL with TOTP, and
  the adminMfaGate trigger withholds `dhc-admins` from tokens until TOTP is set
  up. PermTek-5's own checks (AuthGate, functions/shared/mfa.ts) stay as in the
  template, for tenant admins and operators.
- The template's pool hardening in `backend.ts` is removed: a referenced pool's
  settings are DHC core's.
