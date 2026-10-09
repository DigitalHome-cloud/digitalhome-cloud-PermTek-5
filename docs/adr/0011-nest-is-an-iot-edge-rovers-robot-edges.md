# ADR 0011 — The nest is an IoT edge; rovers will be robot edges

Status: **Accepted** · 2026-10-07

## Context

The garden must run without internet; robots and posts talk only to the nest,
and the cloud never steers the garden. The original plan used a Zenoh router
and a custom signed uploader on the nest. template-dlab5-edge now provides the
cloud link (RFC 8628 device flow, token renewal, version gate), A-Box sync with
three-way merge, jobs, an MCP server and a chat panel, with `edge_kind` human,
iot or robot. digitalhome-edge already speaks the same wire with Node-RED.

## Decision

- **permaculture-nest-edge** on a Raspberry Pi 5, generated with
  `edge_kind=iot`: Node-RED owns LoRa sentinels and IR posts; Python owns link,
  sync, detection jobs (BirdNET, MegaDetector, plant ID) and MCP.
- Rovers become `edge_kind=robot` edges (ROS 2) when the first one exists;
  Zenoh stays between rovers and the nest only.
- Every change an agent proposes on the nest is confirmed by a person.

## Consequences

- No custom uploader: the edge layer's sync replaces it.
- The first rover is the first instance of the robot edge kind in the
  blueprint; it is promoted from candidate then.
- Privacy contract (`docs/privacy-contract.md`) goes into the nest's README and
  chat prompt, as the blueprint requires.
