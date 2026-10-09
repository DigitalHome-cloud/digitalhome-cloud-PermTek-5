# Privacy contract

What never leaves the nest, what is blurred, and what never reaches a public
repository. It goes into the nest's README and its chat prompt (blueprint
step 2), and the cloud's rules enforce the cloud side.

## Never leaves the nest

- Raw audio from the microphones (BirdNET runs on the nest; only the
  identification, its confidence and a short evidence clip for a confirmed or
  above-threshold detection go up).
- Camera frames with people in them (MegaDetector's "person" class): dropped
  on the nest, counted only.
- Rover logs at full rate (only missions, traces and summaries go up).

## Goes up only to the private space

- Exact positions of protected or sensitive species (bat roosts, nests).
- Raw media backing an identification (90 days unless it backs a confirmed one).
- The site plan, georeference and terrain model.

## Shared space

- Positions blurred to the zone; species, status, phenology, interventions.

## Never in a public repository

- Site names, commune, parcel ids, coordinates, absolute elevations, plan
  images, outlines traced from a plan, generated worlds and run data from a
  real site. Enforced by `twin/scripts/check-public.sh` with a private denylist.

## Outside the site

- DHC core learns the site's **location cell** for weather, not its coordinates.
- Exporting to GBIF/INPN is an explicit choice per record set, never a default.
