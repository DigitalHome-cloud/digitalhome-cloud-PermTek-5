# ADR 0012 — perma-core and perma-bio are sidecars in the template's ontology package

Status: **Accepted** · 2026-10-07

## Context

The site model uses REC, Brick and SOSA; the register uses Darwin Core and
OBO relations. perma-core and perma-bio add only what those lack. The cloud
template keeps the T-Box in `packages/ontology` (tbox, concepts, shapes) and
the edge copies it to `edge/ontology/` to validate the same way.

## Decision

- Standard ontologies stay **read-only**; perma-core and perma-bio live as
  **sidecar** files in permaculture-cloud's `packages/ontology`, English
  master with de and fr labels.
- The nest copies the same files; SHACL shapes are the gate on both sides.
- Taxa are referenced by GBIF and TAXREF IRIs, never copied in.

## Consequences

- One T-Box for cloud, nest and twin (via the site A-Box export).
- The namespace (w3id.org/perma or a digitalhome.cloud path) is still open and
  must be fixed before anything is shared.
- Until permaculture-cloud is generated, the modules live in the umbrella's
  `packages/ontology/` folder (first: vegetation, 2026-10-08), in the template's layout,
  and move into `packages/ontology` with the cloud.
