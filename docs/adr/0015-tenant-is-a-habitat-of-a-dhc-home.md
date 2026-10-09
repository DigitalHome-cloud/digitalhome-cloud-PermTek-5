# ADR 0015 — A tenant is the habitat of a DigitalHome.Cloud home

Status: **Accepted** · 2026-10-09 · Refines [ADR 0009](0009-tenant-is-a-site-spaces-shared-private.md) for homes

## Context

ADR 0009 made a tenant a *site*, created by an operator. In practice the
first projects belong to a place that already exists in DigitalHome.Cloud: a
home, with owners, a country and a postal code, and through those an **area**
whose weather DHC core already collects. Asking people to create the site a
second time, and copying the home's location or its weather into PermTek-5,
would double the data and its maintenance (and put more location data in a
second place).

## Decision

1. **The Portal is the starting point.** It opens PermTek-5 with
   `?home=<smartHomeId>` for the active home, like the other DHC apps.
2. **One tenant per home.** `Tenant.smartHomeId` names the home (index
   `byHome`). The habitat's projects (a roof bed, later a garden) are beds and
   zones in its knowledge graph, not further tenants. The shared/private
   spaces of ADR 0009 stay, for access.
3. **The home's owners start it.** The `tenants` function's `startForHome`
   asks DHC core's API `getDigitalHome` **with the caller's own ID token**
   (one user pool, ADR 0008), and checks that the caller is in the home's
   `owners`. Core also shows homes to `dhc-admins`, so seeing the home is not
   enough: an operator cannot start someone's habitat. It creates the tenant
   and its shared space with the caller as admin; a co-owner arriving later
   joins the existing habitat as admin. Two-step sign-in is still required,
   as for every tenant admin.
4. **Nothing from the home is copied.** PermTek-5 keeps the home's id and
   nothing else. The area is `{country}-{postalCode}` (read off a minted home
   id, or from the home row); its record and its weather gold
   (`public/weather/gold/{areaId}/{window}/*.json`) are read from DHC core in
   place, as the signed-in person: core API with their ID token, core bucket
   with their identity-pool credentials. Where the core is (API, bucket,
   region) is looked up at deploy time with the pool
   (`backend/scripts/dhc-auth-env.mjs`) and reaches the site as
   `custom.dhcCore` in the outputs.
5. Operator-created tenants without a home (ADR 0009: PermaDemo and other
   virtual sites) remain possible; they just have no `smartHomeId` and no
   climate card.

## Consequences

- The habitat page shows the area's climate (monthly normals of the daily
  minimum, mean and maximum, rain, sun, wind) from the same files as the
  Portal's area page: one source, no drift. The crop calendar (next step)
  derives from it.
- An area without weather in DHC core shows "no data yet"; adding it is a
  change to DHC's pipeline (`pipelines/weather/areas.json`), not here.
- PermTek-5 depends on DHC core's schema for `getDigitalHome`, `getArea` and
  the gold layout. A breaking change there breaks the habitat page, not
  sign-in or the rest of the app.
- Space members who are not tenant admins cannot read tenant rows, so the
  habitat panel is shown to admins; members keep their spaces as before.
- Two owners pressing "start" at the same moment could create two tenants for
  one home (the index is not a uniqueness constraint). Accepted for now: rare,
  visible, and fixed by an operator; a conditional guard row closes it if it
  ever happens.
- The public repository holds no home id, postal code or area of a real home:
  they live in DHC core and in the private denylist (ADR 0013).
