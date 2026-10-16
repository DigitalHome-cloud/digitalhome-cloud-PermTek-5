# ADR 0030: Real relief from an elevation model

Status: **Accepted** · 2026-10-16 · Builds on [ADR 0013](0013-twin-public-code-private-site.md), [ADR 0014](0014-twin-on-ros2-scenarios-fleet-edge.md)

## Context

**The garden twin's ground was a plane** through two surveyed points (`terrain.high`, `terrain.low`). Pads, contour
benches (fascines) and the pond are carved into it. That gives the right overall slope, but not the real ground's
swells and hollows, which decide where water gathers and where a rover tilts.

**The owner asked** whether Blender's Python could make the relief for the Webots world from geodata.

**For France, IGN publishes:**
- **LiDAR HD:** a bare-earth terrain model (MNT) at 0.5 m;
- **RGE ALTI:** 1 m, everywhere in France;
- **BD ORTHO:** aerial photos at 20 cm.

All three are under the Licence Ouverte 2.0, and the Géoplateforme's WMS-R serves them as raw 32-bit floats or JPEG.

## Decision

1. **Webots gets an ElevationGrid, not a Blender mesh.**
   - `generate_world.py` already writes the ground as an ElevationGrid with 0.5 m cells. It is Webots' fast, stable
     ground contact, and the bounding object is the same grid.
   - With `terrain.dem` in the site file, the grid follows the elevation model (`twin/tools/dem.py`, bilinear,
     holes filled).
   - The pads, benches and pond are still shaped on top.
   - The rovers keep a plane in `site_config.json`, now the plane fitted to the relief: what they know, not the
     truth.
   - `--plane` ignores the model.
2. **IGN's data is fetched into the private pack** (`twin/tools/fetch_ign.py`).
   - **The relief:** LiDAR HD where it covers the site, else RGE ALTI.
   - **The aerial photo,** as the ground texture (`ground_image`).
   - **Credit:** the site file's `info` credits the source and its licence.
   - **The locating number:** the site file's `terrain.dem.origin` is the projected coordinate of the local 0, 0,
     and it locates the site, so it lives only in the private pack. The tool refuses to write inside this
     repository.
   - **The GeoTIFF format:** the twin reads and writes plain (uncompressed float32) GeoTIFFs with numpy alone. A
     compressed one is read with `tifffile` if it is installed.
3. **Blender only for the film** (`twin/tools/garden_film.py`, any Python with bpy).
   - It drapes the ground texture over the generator's own heights (`worlds/terrain.npz`), so the film and the world
     show the same ground.
   - It adds the trees, posts, tank, nest, pond and fascines from `site_config.json`.
   - Outputs go to `worlds/films/`, never published.
4. **A public site exercises the path: `permademo-relief`.**
   - `sites/permademo-relief/dem.tif` is an invented relief: PermaDemo's plane, swells and a hollow, from
     `tools/make_demo_dem.py`, with the made-up origin 100000, 100000.
   - PermaDemo itself, the reference, stays on its plane.
   - `scripts/check-public.sh` allows that one `.tif`. It refuses any public site whose elevation model has another
     origin, and still refuses every other map-like file.

## Consequences

- A real site's world has its real ground.
- **The relief changes the rovers' mission.** On `permademo-relief`, in a first headless run of 12 garden hours,
  rovers got stuck 5 times against 2 on the plane, and rover1 left the frame near the nest. The dock line and the
  fascines follow the fitted plane's contour, not the real ground's.
  - Fix that (twin open issue 6) before a real site's relief is trusted.
  - That is why PermaDemo, the reference, stays on its plane.
- The fascines' contours follow the fitted fall line. On strongly curved ground, a contour line is an
  approximation; drawing fascines along the model's real contours is a later step.
- The twin needs no GIS stack: numpy, Pillow and shapely, as before. Blender is optional and only for films.
- Outside France another GeoTIFF in a metric projection works the same way. `fetch_ign.py` is France only.
