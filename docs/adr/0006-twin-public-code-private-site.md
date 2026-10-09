# ADR 0006 — The twin's code is public; the site is private data

Status: **Accepted** · 2026-10-07

## Context

The Webots twin should be published under GPL-3.0-or-later, like the D-LAB-5
templates. The first version was generated from the owner's plan and carried
the place in many forms: the plan image and the ground texture made from it,
place names in the world and docs, absolute elevations and the slope bearing,
the outlines of the parcels, and run data from that world.

## Decision

- **Code public, site private.** GPL covers the program; a site file is its
  input data, not part of it.
- The generator reads a **site file** in local metres (`--site`); plan tracing
  is a private tool that emits it. Public sites must have `z_offset` 0 and no
  `ground_image`.
- The public repo ships an **invented demo hillside** (CC0) with the same slope
  and features, so every lesson and test still applies.
- Generated worlds, `site_config.json` and run data are **never committed**.
- `scripts/check-public.sh` runs before every commit: it refuses plans,
  generated files, geographic keys, real elevations and any term from a
  **private denylist** (`~/.config/permaculture/denylist`, never committed).
- The public repo starts from a **fresh history**; the original zip and plan
  live in a private site pack outside the repository (no public remote). Later the private site comes from the cloud's private space.

## Consequences

- Rebuilding the real world is `generate_world.py --site <private>/site.json`;
  verified identical to the original world.
- Bugs that only show on the real site are described in local terms (zone,
  fascine, post id), never with place data.
- The umbrella repository holds the build plan with the site name, so it
  stays private; only `twin/` is published.

## Amendment (2026-10-09): the whole project is public as PermTek-5

The umbrella (docs, ontology, twin) is published as
`DigitalHome-cloud/digitalhome-cloud-PermTek-5`, with a fresh history. Everything that
locates the first site (its name, the commune, the original handoff, site notes,
calendars, site and vegetation files) lives only in the private site pack.
`scripts/check-public.sh` now guards the whole repository, not just `twin/`.
