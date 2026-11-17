# ADR 0010 — Weather and environment data come from DHC core

Status: **Accepted** · 2026-10-07

## Context

Both the SmartHome (heating, shading, RE2020) and the garden (watering
suggestions, phenology, disease risk) need weather: observations, forecasts,
rain, wind, frost. Fetching and storing it twice would mean two API keys, two
caches and two answers to the same question.

## Decision

- One **environment service in DHC core**: weather API(s) and local stations,
  keyed by a location cell, readable by every app on the platform.
- The permaculture cloud is a **consumer** (Microclimate screen, nest jobs).
- The garden's **own sensors** (soil moisture, IR posts, sentinels, tank level)
  stay in the permaculture cloud and on the nest.

## Consequences

- The service must be built in `repos/core` before phase 2 (Observe); its API
  shape and location key are an open decision in the build plan.
- A site's location cell is shared with core, not its exact coordinates.
- Offline, the nest uses its own sensors; weather is a cloud-side enrichment.
