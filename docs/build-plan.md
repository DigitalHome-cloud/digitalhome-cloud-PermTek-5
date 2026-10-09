# PermTek-5 — build plan

Oct 7, 2026 · revised Oct 9, 2026

## Goal and scope

PermTek-5 is a new app on the DigitalHome.Cloud platform that shows a permaculture site as a living model: its zones and plants, every plant and animal detected there, what the robots observed, and which interventions are suggested. The Webots twin is its test bench. The first real site is private; PermaDemo is public; the data model is multi-site from day one, as DigitalHome.Cloud already is.

**Users**

- The owner, often away: checks the garden remotely, validates species, accepts or rejects suggested interventions.
- Helpers and neighbours (later): read-only views and simple tasks.
- Machines: sentinels, IR posts, rovers and the nest write observations; they never read the cloud to decide what to do.

**In scope for v1**

- Site model (zones, guilds, plants, fixed equipment) on REC + Brick + perma-core.
- Biodiversity register: every plant and animal species detected, with evidence and validation.
- Observations, interventions and robot status from the edge.
- The Webots twin, driven by the same site model.

**Out of scope for v1**: robots that act (watering, cutting, harvesting), a public species portal, multi-user organisations.

**Design rules**

1. Observe before acting: the app suggests, a person accepts.
2. The garden runs without internet. The edge is the coordinator; the cloud is archive, design and review.
3. Reuse the D-LAB-5 templates and DigitalHome.Cloud: Amplify Gen 2, the DHC Cognito user pool, tenants and spaces, edges linked by device flow, one A-Box per space checked with SHACL, REC + Brick. (Revised 2026-10-07: the platform moved from Gen1 to Gen 2; see ADR 0008.)
4. Clean core: standard ontologies stay read-only; perma-core and local labels live in sidecar files.
5. SHACL is the gate: nothing reaches a robot or the register unless it validates.
6. Code public, sites private: the twin and the templates are GPL; site plans, coordinates and elevations never leave private storage (ADR 0013).

## The loop: Observe, Design, Build, Run

The story from a new site to a running garden is `docs/workflow.md`. The app follows the same four-stage loop as the DigitalHome.Cloud Portal, in the same colours (`docs/design-identity.md`). Underneath it is plan–do–check–act; "observe and interact" is also the first permaculture principle.

| Stage | PDCA | In the garden | Screens |
| --- | --- | --- | --- |
| Observe | Check | sentinels, species register, weather from DHC core, robot traces | Site map, Species register, Microclimate |
| Design | Plan | zones, guilds, plants in the Modeler; what-if runs in the twin | Site modeler, Twin |
| Build | Do | earthworks, planting, install posts, anchors and nest; pair edges | Zones and plants, Robots and edge (pairing) |
| Run | Act | suggested interventions accepted and done, missions, alerts; feeds the next Observe | Interventions, Robots and edge |

## Architecture

Four parts, one rule: robots and posts talk only to the nest, and the cloud never steers the garden. Diagram and the DigitalHome.Cloud overlap: `docs/architecture.md`.

One published site model feeds the cloud graph, the nest's copy and the Webots twin; observations flow back up whenever the nest is online.

**Product shape** (blueprint `cloud-edge-platform.ttl`): a cloud made from template-dlab5-cloud, a nest made from template-dlab5-edge (`edge_kind=iot`), rovers later as robot edges (`edge_kind=robot`, the first instance of that kind).

| Blueprint term | Here |
| --- | --- |
| Tenant | a site (a private real site first, PermaDemo for everyone; multi-site from day one) |
| Space `shared` | zones, plants, register, interventions, robot status |
| Space `private` | exact positions of sensitive species, raw media, the site plan and georeference |
| Tenant admin | the owner |
| Space reader | helpers and neighbours (later) |
| Edge | the nest (iot); rovers (robot, later) |

## Overlap with DigitalHome.Cloud

Separate product, separate backend, shared where it saves work (ADRs 0008, 0003):

| Shared | How |
| --- | --- |
| User pool | one Cognito pool (DHC core), imported with `referenceAuth`; one account across apps; `auth.digitalhome.cloud` |
| Portal | a tile on the Portal's loop page links to PermTek-5 (domain to decide) with `?site=` |
| Weather and environment | one environment service in DHC core (weather API + local stations, keyed by location cell), read by both |
| Modeler | edits the perma-core library (to confirm: Modeler writing to a library of another backend) |
| Design tokens | the Portal's palette, later one token file in `repos/shared` |

**Not shared**: SmartHome IDs, device and electrical models (NF C 15-100), Homematic and Hue, the SmartHome GraphQL schema. Garden sensors (soil, IR posts, sentinels) stay in the permaculture cloud.

## Biodiversity register (plants and animals)

Every plant and animal detected on a site goes into one register, **perma-bio**: a small sidecar to perma-core built on [Darwin Core in RDF](https://dwc.tdwg.org/rdf) and SOSA. Species are never copied in: each taxon is referenced by its GBIF and TAXREF IRIs, with only names and statuses cached. A detection is evidence; a species joins the site list only once a person confirms it.

**The model**

| Class | Standard | What it holds | Example |
| --- | --- | --- | --- |
| Taxon | dwc:Taxon, IRI to GBIF + [TAXREF](https://www.data.gouv.fr/datasets/referentiel-taxonomique-taxref) | scientific name, rank, FR/DE/EN names (sidecar labels), protection, red-list and invasive status | *Sus scrofa*, *Onobrychis viciifolia* |
| Organism | dwc:Organism (perma:Plant is a subclass) | an individual followed over years | an apple tree in zone 4 |
| Event | dwc:Event, linked to a robot mission or sentinel window | when, where, who or what looked | rover1 mission, 7 Oct, 06:00–08:00 |
| Observation | sosa:Observation | the raw sensor result: image, audio clip, thermal frame | mast camera frame at post 1 |
| Identification | dwc:Identification | taxon proposed, by whom (person or model + version), confidence, status | BirdNET 0.82 → *Turdus merula*, Suggested |
| Occurrence | dwc:Occurrence | taxon present at a place and time, once identifications are aggregated | wild boar, zone 3 edge, night of 6 Oct |
| Evidence | Audubon Core media, file in object storage with a hash | the photo, sound or video behind an identification | `s3://…/2026/10/07/post1.jpg` |
| Interaction | OBO Relation Ontology terms, as used by GloBI | who does what to whom: pollinates, eats, damages, visits | honeybee pollinates jujube; boar damages fence |

Place is always a perma-core zone or guild (`perma:observedInZone`) plus a point; habitat types use ENVO. Status reuses the perma-core SKOS scheme: Suggested → Confirmed or Rejected.

**Where detections come from**

| Source | Detects | Runs on |
| --- | --- | --- |
| Rover and mast cameras + a plant identifier (Pl@ntNet API or a local model) | plants, flowering stage, leaf damage | nest (local model) or cloud (API) |
| Thermal and night cameras | boar, roe deer, fox, hedgehog | nest |
| Microphone + BirdNET | birds | nest, offline |
| Passive ultrasonic recorder (listening only) | bats | nest, nightly batch |
| Owner's phone photos in the app | anything | cloud |
| GBIF and INPN downloads for the commune | baseline: species already recorded nearby | cloud, once a season |

**Rules**

1. A machine identification stays Suggested. It becomes an Occurrence only above a confidence threshold, and joins the site species list only when a person confirms it (threshold to tune per source).
2. Exact positions of protected or sensitive species (bat roosts, nests) are blurred to the zone in anything shared.
3. Raw media are kept 90 days unless they back a confirmed identification (retention to agree).
4. The register can later be exported as a Darwin Core Archive to GBIF or INPN; that is a choice, not a default.

Note: MNHN servers suffered a cyberattack and some INPN pages were unreachable when this plan was written, so TAXREF access should go through a cached copy.

## The app

Eight screens cover v1, grouped by the loop stage they serve; the Observe and Run screens are the ones you would open every week. Editing the site reuses the DigitalHome.Cloud Modeler, so the app itself stays mostly read and review. The home page is the same loop as the Portal's, with the active site in the centre instead of the active home.

| Stage | Screen | What it shows | You can |
| --- | --- | --- | --- |
| Observe | Site map | the plan as base map (private space); zones, posts, anchors, nest; rovers' last positions; traces shaded by how fresh they are (read-time decay) | tap a zone or post to drill in |
| Observe | Species register | every taxon detected: status, first and last seen, zones, evidence gallery, interactions | confirm or reject identifications |
| Observe | Microclimate | weather from the DHC environment service; soil moisture, air temperature, light per zone from the garden's own sensors; tank level; rain | compare zones, set alert thresholds |
| Design | Site modeler | DigitalHome.Cloud Modeler with the perma-core library | edit zones, plants, equipment; publish a new site version |
| Design | Twin | Webots runs of the current site model, sim vs real side by side | start a what-if run (new fascine, new tree, a third rover) |
| Build | Zones and plants | zone → guild → plant cards with phenology (BBCH), health notes, last observations | add a note or photo, mark planted |
| Build / Run | Robots and edge | each rover, sentinel, post and anchor: battery, last sync, docking, suspect anchors; pairing of new edges (`/link`) | pair, flag for inspection, revoke |
| Run | Interventions | Suggested → Accepted → Done, with the observation that triggered each | accept, reject, assign to yourself or a robot |

Publishing a new site version regenerates three things from one model: the A-BOX in the cloud, the edge's local copy, and the Webots world. That is the link between the app and the twin.

## Webots digital twin

The twin exists as a Webots project (its original handoff is kept with the private site pack): the 44.5 % slope, fascines, anchors, IR posts, nest and two explorer rovers. It is now in `twin/`, split so its code can be published (ADR 0013):

- `twin/` (future public repo **permaculture-twin**, GPL-3.0-or-later): controllers, protos, a generator that reads a **site file** (`--site`), a leak guard, and an invented **demo hillside** with the same slope and features.
- a **private site pack** outside this repository (never a public remote): the plan, its traces (`trace_plan.py` → `site.json`), the original zip. The generator rebuilds the first site's world from it identically.

**Three jobs**

1. **Test bench**: robot code runs in the twin before it runs in the garden. Same controllers, same trace format, same store.
2. **What-if**: try a site change (a fascine, a path, a third rover, a new nest place) before digging.
3. **Replay**: feed real sentinel data (soil moisture, rain, wind) into the twin's garden supervisor and check that the stigmergy rules (claims, decay, write limits) behave on real conditions.

**How it stays in sync**

- The generator already reads a site file instead of plan pixels; next it reads the published site model (A-BOX export of the private space). One model, three outputs: cloud, edge, twin.
- Terrain switches from the two-point plane to IGN RGE ALTI 1 m once the house coordinates are known; the elevation grid lives in the private space, never in the public repo.
- Twin runs write to a separate sandbox site, so simulated observations never mix with real ones. The app shows them side by side on the Twin screen.
- Field tests feed parameters back: wheel slip on wet clay, IR range in sun, UWB error under oaks, battery use per mission.

**On ROS 2** (ADR 0014): rovers become a mission node plus a Webots driver plugin, so the same node later runs on a real rover; stigmergy stays the only channel between rovers. Scenarios become files run by the garden supervisor, and the fleet console is a robot edge (**permaculture-fleet-edge**, `edge_kind=robot`). Step 1: `docs/plans/twin-step-1-ros2-rover.md`.

**Where it runs**: on your machine with a GPU for interactive work; headless batch runs (100+ garden hours) on a small cloud instance, results uploaded to the sandbox site.

## Tech stack

Reuse the D-LAB-5 templates and what DigitalHome.Cloud already runs; add only the edge stack and the detection models. (Revised 2026-10-07.)

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Gatsby 5 from template-dlab5-cloud, in this repository (PermTek-5; domain to decide) | same platform, same deploy, tenants and spaces built in |
| Backend | Amplify Gen 2, own backend (not in DHC core) | permaculture models stay out of the SmartHome schema (ADR 0008) |
| Login | DHC Cognito user pool imported with `referenceAuth` | one account across apps |
| Style | the Portal's palette and IBM Plex fonts mapped onto the template's `--app-*` tokens | one visual identity (`docs/design-identity.md`) |
| Map | MapLibre GL, the plan as a georeferenced raster (private space) | open source, works offline-cached |
| Knowledge graph | one A-Box per space in S3, versioned, SHACL-checked (template ADR-0007); Oxigraph only on the nest for SPARQL | no graph server to run in the cloud |
| Validation | pySHACL on the edge, the template's SHACL check on every publish and every edge upload | the clean-core gate |
| Observations | DynamoDB for recent data, Parquet on S3 for history | the hot/cold split already evaluated for Homematic |
| Weather | DHC core environment service | shared with SmartHome (ADR 0010) |
| Media | S3 behind the template's object proxy, 90-day lifecycle rule | evidence for identifications |
| Edge (nest) | Raspberry Pi 5, template-dlab5-edge with `edge_kind=iot`: Node-RED for LoRa sentinels and IR posts, Python for link, sync, jobs, MCP | garden works offline; same wire as digitalhome-edge (ADR 0011) |
| Robots | ROS 2 on rovers, `edge_kind=robot` later; Zenoh only between rovers and nest | already the robotics direction |
| Detection | BirdNET (birds), MegaDetector (animals in camera images), Pl@ntNet API or a local plant model, as edge jobs | proven, open models first |
| Edge → cloud | device flow link (RFC 8628) + `edge/sync.py` three-way merge of the A-Box, uploads when online | replaces the custom signed uploader |
| Agent access | the edge's MCP server and chat panel; every change is a proposal a person confirms | ask Claude "what flowered in zone 2 this week?" |
| Twin | Webots R2025a, Python controllers, generated from a site file; ROS 2 via webots\_ros2 later | the existing project, publishable |

## Roadmap

Realigned 2026-10-07 to the workflow in `docs/workflow.md`: people fix the frame before
any robot moves, robots explore inside it before the post routine starts, and the twin
tries every step first. The register and the app still come before any robot touches the
garden, so the first useful version is ready by February 2027, while the year-0
earthworks (fence, tank, fascines) happen in the same winter.

| Phase | Workflow stages | Cloud and nest | Twin | Gate |
| --- | --- | --- | --- | --- |
| 1 · Site and frame (Oct–Nov 2026) | 0 Create, 1 Desk, 2 Frame | cloud generated from template-dlab5-cloud (done 2026-10-09: `rename.mjs … --tenant Site --space Area`, `referenceAuth` to the DHC pool); create the first site (tenant, spaces, location cell); boundary, fixed objects and no-go areas into the private space; IGN RGE ALTI terrain; perma-core + perma-bio T-Box; Portal tile | site file gains **geofence and no-go areas**; world from it; reachability check | the published frame regenerates the twin world, and the twin confirms every part is reachable from the nest |
| 2 · Build the minimum (Nov 2026–Feb 2027) | 1 Desk (weather), 3 Build | environment service in DHC core; generate **permaculture-nest-edge** (`edge_kind=iot`), pair it, prove the device flow (`scripts/verify-edge.mjs`); sentinels via LoRa into Node-RED; as-built positions | regenerate from as-built; nest and anchor places tried first | nest linked, A-Box round-trip validated; **30 days unattended** |
| 3 · Observe from the nest (Feb–spring 2027) | 5 Observe (without robots) | Site map, Species register, Microclimate; BirdNET, MegaDetector, plant ID as nest jobs | replay of real sentinel data | first useful version: a weekly 10-minute review works |
| 4 · Explore with robots (2027) | 4 Explore, then 5 with the post routine | review of Suggested findings; rovers as robot edges (**permaculture-fleet-edge**) | **explore mission** (coverage by stigmergy, geofence-aware contour planner), then scenarios | twin matches garden; coverage complete; map confirmed |
| 5 · The loop (from a full year of observation) | 6 Design · Build · Run | Modeler with perma-core, site publish → cloud + nest + twin; interventions with robot assignment; Darwin Core export option | what-if runs | one published site version drives all three |

Each gate must pass before the next phase starts: "30 days unattended" means the nest
uploads a month of sentinel data with nothing lost; "twin matches garden" means rover
missions and position error in the garden stay within what the twin predicted.

**Twin order** (ADR 0014, amended): step 1 ROS 2 rover (done, items 1–7);
**step 2 frame and explore**: geofence and no-go areas in the site file, a contour-first
planner that stays inside them (this also fixes the fence trap), the explore mission, then
the switch-over to ROS only; step 3 scenarios; step 4 fleet edge; step 5 web 3D view.

**Plant knowledge** (`packages/ontology/`, prototype 2026-10-09): crop library (names EN/FR/DE/Latin,
parts, ways of keeping, seed saving), site calendars, recipes; linked to GBIF and, through
Wikidata, to TAXREF. Next, in this order, **when the library is scaled beyond the first crops**:

1. **PFAF, the clean route**: write to Plants For A Future (they ask to be notified of use),
   explain the use, ask for a bulk download. Text is CC BY ~SA 4.0 (treated as BY-SA); images
   are BY-NC-ND 3.0 and are not imported; their code is proprietary and there is no API.
2. **PFAF, crop by crop** meanwhile: edible parts, uses and hardiness for the library's crops,
   in a separate generated `crops-pfaf.ttl` with attribution and CC BY-SA 4.0, so share-alike
   stays with that file.
3. **TAXREF statuses** (French protection, red lists) from TAXREF's downloadable status file,
   cached locally; its API answers scripts with a bot challenge since the MNHN outage.
4. **Pl@ntNet** for phone photos into the register (free up to 500 identifications a day;
   needs an API key).
5. **BioCLIP 2** (open model) on photos and in the twin's rover camera, then on nest hardware,
   for offline identification. Every machine identification stays Suggested.

**Follow-ups outside this repository**: Portal tile and `getAppUrl` entry (DHC portal); environment service (DHC core); lift the Portal's `--ov-*` tokens into `repos/shared`; record the product in blueprinting-dlab5-net once the repos exist.

## Open decisions and risks

| Decision | Options | Needed by |
| --- | --- | --- |
| Groups in the shared pool | the permaculture backend creates its `t-…`/`s-…` groups in the DHC pool; check naming does not collide with `dhc-*` and that its `tenants` function may manage groups in an imported pool | phase 1 |
| Environment service API | shape and location key (grid cell, commune, or point) of the DHC core service | phase 2 |
| Internet on the first site | house broadband, 4G router at the nest, or none (upload when you visit) | phase 2 |
| Nest power | solar + battery, or a cable from the house | phase 2 |
| Plant identification | Pl@ntNet API (check terms and quota) or a local model on the nest | phase 3 |
| Real terrain | send the house coordinates → IGN RGE ALTI 1 m replaces the two-point plane (private space only) | phase 1 |
| Namespaces | register w3id.org/perma and /perma-bio, or use a digitalhome.cloud path | before sharing |
| Sharing records | keep private, or export to GBIF / INPN | phase 3 |
| Modeler for perma-core | Modeler edits a library that lives in another backend, or perma-core is edited in this app | phase 3 |

Decided: **where the graph lives** → one A-Box per space in S3 (template ADR-0007), Oxigraph only on the nest.

**Risks**

- **Slope**: 44.5 % is at the limit for small wheeled rovers. It affects robot hardware (tracks, or the perma spider on cables), not the app or the register.
- **Wrong identifications** flooding the register: machine results stay Suggested until confirmed.
- **Sensitive species**: bat roosts and nests must not leak through shared maps; positions are blurred to the zone.
- **Location leaks through public code**: the twin is public; plans, elevations and names stay in the private pack, and `twin/scripts/check-public.sh` blocks them at commit.
- **Disturbing wildlife**: no night lighting and no ultrasonic emitters, as already decided.
- **Your time**: every screen must be useful in a 10-minute visit; anything needing daily attention is out.
- **INPN availability** after the MNHN cyberattack: cache TAXREF and statuses locally.
