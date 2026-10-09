# ADR 0002 — A tenant is a site; spaces split shared from private

Status: **Accepted** · 2026-10-07

## Context

The data model is multi-site from day one. Some data must not reach every
reader: exact positions of protected species (bat roosts, nests), raw media,
the site plan and its georeference.

## Decision

Using template-dlab5-cloud ADR-0005:

| Blueprint | Here |
|---|---|
| tenant (`t-…`) | a site, e.g. the first real site, or PermaDemo |
| space `shared` (`s-…`) | zones, guilds, plants, register (positions blurred to the zone), interventions, robot status |
| space `private` (`s-…`) | the plan, georeference and terrain, exact positions of sensitive species, raw media |
| tenant admin | the owner: validates species, accepts interventions, pairs edges |
| space reader | helpers and neighbours (later), `shared` only |
| operator (`app-admins`) | runs the platform, sees no garden content |

Each space has its own A-Box (template ADR-0007).

## Consequences

- Blurring is structural: the shared A-Box only holds the zone, the private one
  the point. A shared map cannot leak what it never received.
- The twin's site file and the Site map's base layer come from the private space.
- A second site is a second tenant; nothing in the model is specific to one site.
