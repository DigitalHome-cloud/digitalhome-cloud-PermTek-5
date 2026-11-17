# SPDX-License-Identifier: GPL-3.0-or-later
"""A film of the garden twin's ground, rendered with Blender (ADR 0030): the relief the world was made from, the
ground texture draped over it (the site's aerial photo when it has one, else the drawn zones), and the garden on it.

    <bpy python> tools/garden_film.py [--quality draft|good|best] [--still-only] [--seconds 20]

Runs in any Python with Blender's bpy module (pip install bpy, or the twin edge's .venv-bpy); the generator itself
never needs Blender. Run tools/generate_world.py first: this reads its outputs, never the site file:
  worlds/terrain.npz          the ground's heights, exactly the world's ElevationGrid
  worlds/textures/ground.jpg  the ground texture, cropped to the same extent
  site_config.json            trees and shrubs, the posts, the tank, the nest, the pond, the fascines
and writes worlds/films/garden-poster.png and garden.mp4 (generated outputs, never published: a real site's relief
and photo stay private). The camera circles the garden once, high, then lower over the slope. Cycles on the CPU.
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FPS = 24
QUALITY = {"draft": (640, 360, 8, 2), "good": (960, 540, 16, 2), "best": (1280, 720, 32, 1)}   # size, samples, frame step


def material(name, rgb, rough=0.9, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    if image:
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image)
        m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    return m


def ground(t, tex):
    """The world's ElevationGrid as a mesh, the ground texture across it (u along x, v along y)."""
    h = t["heights"]
    ny, nx = h.shape
    x0, y0, s = float(t["x0"]), float(t["y0"]), float(t["spacing"])
    verts = [(x0 + i * s, y0 + j * s, float(h[j, i])) for j in range(ny) for i in range(nx)]
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(ny - 1) for i in range(nx - 1)]
    mesh = bpy.data.meshes.new("ground")
    mesh.from_pydata(verts, [], faces)
    uv = mesh.uv_layers.new(name="uv")
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.loops[li].vertex_index
            uv.data[li].uv = ((v % nx) / (nx - 1), (v // nx) / (ny - 1))
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new("ground", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material("ground", (0.4, 0.45, 0.3), 1.0, tex if os.path.exists(tex) else None))
    return obj


def height_at(t, x, y):
    h, x0, y0, s = t["heights"], float(t["x0"]), float(t["y0"]), float(t["spacing"])
    i = min(max(int(round((x - x0) / s)), 0), h.shape[1] - 1)
    j = min(max(int(round((y - y0) / s)), 0), h.shape[0] - 1)
    return float(h[j, i])


def add(kind, name, loc, scale, mat, rot=(0.0, 0.0, 0.0)):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.5, depth=1.0, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.5, location=loc)
    o = bpy.context.active_object
    o.name, o.scale = name, scale
    o.data.materials.append(mat)
    if kind == "sphere":
        bpy.ops.object.shade_smooth()
    return o


def garden(t, cfg):
    bark, leaf = material("bark", (0.22, 0.15, 0.1)), material("leaves", (0.13, 0.27, 0.08), 0.8)
    shrub = material("shrub", (0.2, 0.33, 0.12), 0.85)
    for v in cfg.get("vegetation", []):
        if "circle" not in v:
            continue
        x, y = v["circle"]
        z = height_at(t, x, y)
        hgt = float(v.get("height_m", 3.0))
        r = float(v.get("canopy_r", max(0.6, hgt * 0.3)))
        if v.get("class") == "tree" or hgt >= 2.5:
            add("cyl", f'trunk {v["id"]}', (x, y, z + hgt * 0.35), (0.6 * v.get("trunk", 0.2) * 2, 0.6 * v.get("trunk", 0.2) * 2, hgt * 0.7), bark)
            add("sphere", f'crown {v["id"]}', (x, y, z + hgt - r * 0.6), (2 * r, 2 * r, 1.6 * r), leaf)
        else:
            add("sphere", f'shrub {v["id"]}', (x, y, z + hgt * 0.4), (2 * r, 2 * r, hgt), shrub)
    post, wood = material("post", (0.85, 0.85, 0.8), 0.5), material("wood", (0.4, 0.27, 0.15))
    for p in cfg.get("posts", []):
        x, y = p["pos"]
        add("cyl", f'post {p["id"]}', (x, y, height_at(t, x, y) + 0.6), (0.08, 0.08, 1.2), post)
    tank = cfg.get("tank")
    if tank:
        x, y = tank["center"]
        add("cyl", "tank", (x, y, height_at(t, x, y) + tank["height"] / 2), (2 * tank["radius"], 2 * tank["radius"], tank["height"]),
            material("tank", (0.25, 0.3, 0.25), 0.6))
    nest = cfg.get("nest")
    if nest:
        x, y = nest["center"]
        sx, sy, sz = nest["size"]
        add("cube", "nest", (x, y, height_at(t, x, y) + sz / 2), (sx, sy, sz), wood, (0, 0, nest.get("yaw", 0.0)))
    pond = cfg.get("pond")
    if pond:
        x, y = pond["center"]
        add("cyl", "pond", (x, y, height_at(t, x, y) + 0.05), (2 * (pond["radius"] - 0.3), 2 * (pond["radius"] - 0.3), 0.02),
            material("water", (0.12, 0.22, 0.3), 0.05))
    for c in cfg.get("contours", []):                # fascines: brushwood bundles along the contour
        (ax, ay), (bx, by) = c["a"], c["b"]
        n = max(2, int(math.hypot(bx - ax, by - ay) / 0.8))
        for k in range(n):
            x, y = ax + (bx - ax) * k / (n - 1), ay + (by - ay) * k / (n - 1)
            add("cyl", f'{c["name"]} {k}', (x, y, height_at(t, x, y) + 0.12), (0.3, 0.3, 0.9), wood,
                (math.pi / 2, 0, math.atan2(by - ay, bx - ax) + math.pi / 2))


def sky(scene):
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    bg = nodes["Background"]
    sky_ = nodes.new("ShaderNodeTexSky")
    try:
        sky_.sky_type = "NISHITA"
        sky_.sun_elevation = math.radians(38)
        sky_.sun_rotation = math.radians(150)
    except (AttributeError, TypeError):
        pass
    world.node_tree.links.new(sky_.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(1.0)
    sun.rotation_euler = (math.radians(52), 0, math.radians(150))
    bpy.context.collection.objects.link(sun)


def camera(scene, t, cfg, frames):
    """Once round the garden: high to start, lower over the slope, up again."""
    poly = cfg.get("garden_polygon") or [[float(t["x0"]), float(t["y0"])]]
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    cz = height_at(t, cx, cy)
    span = max(max(p[0] for p in poly) - min(p[0] for p in poly), max(p[1] for p in poly) - min(p[1] for p in poly), 20.0)
    target = bpy.data.objects.new("look at", None)
    target.location = (cx, cy, cz)
    bpy.context.collection.objects.link(target)
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 28
    look = cam.constraints.new("TRACK_TO")
    look.target = target
    look.track_axis, look.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
    for f in range(1, frames + 1, 12):
        a = 2 * math.pi * (f - 1) / frames - math.pi / 2
        rise = 0.75 + 0.35 * math.cos(2 * math.pi * (f - 1) / frames)          # high, lower halfway, high again
        r = span * 0.9
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        cam.location = (x, y, max(height_at(t, x, y) + 4.0, cz + span * 0.45 * rise))
        cam.keyframe_insert("location", frame=f)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--quality", choices=tuple(QUALITY), default="draft")
    ap.add_argument("--seconds", type=float, default=20.0)
    ap.add_argument("--still-only", action="store_true")
    a = ap.parse_args(argv)
    terrain = os.path.join(ROOT, "worlds", "terrain.npz")
    if not os.path.exists(terrain):
        raise SystemExit("run tools/generate_world.py first (worlds/terrain.npz)")
    t = dict(np.load(terrain))
    with open(os.path.join(ROOT, "site_config.json")) as fh:
        cfg = json.load(fh)
    out = os.path.join(ROOT, "worlds", "films")
    os.makedirs(out, exist_ok=True)
    frames = int(a.seconds * FPS)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    ground(t, os.path.join(ROOT, "worlds", "textures", "ground.jpg"))
    garden(t, cfg)
    sky(scene)
    camera(scene, t, cfg, frames)
    w, h, samples, step = QUALITY[a.quality]
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    try:
        scene.cycles.use_denoising = True
    except Exception:
        pass
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, frames
    scene.render.image_settings.file_format = "PNG"
    try:                                       # the edge's films' look: AgX, a stop darker than the sky would make it
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Base Contrast"
        scene.view_settings.exposure = -1.0
    except TypeError:
        scene.view_settings.view_transform = "Filmic"

    scene.frame_set(1)
    scene.render.filepath = os.path.join(out, "garden-poster.png")
    bpy.ops.render.render(write_still=True)
    print("poster " + scene.render.filepath, flush=True)
    if a.still_only:
        return 0
    frames_dir = os.path.join(out, "frames-garden")
    shutil.rmtree(frames_dir, ignore_errors=True)
    os.makedirs(frames_dir)
    todo = list(range(1, frames + 1, step))
    for i, f in enumerate(todo, 1):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(frames_dir, f"f_{i:04d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"frame {i}/{len(todo)}", flush=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("no ffmpeg on the PATH: the frames stay in " + frames_dir, flush=True)
        return 0
    between = ["-vf", f"minterpolate=fps={FPS}:mi_mode=mci"] if step > 1 else []
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", str(FPS / step), "-i", os.path.join(frames_dir, "f_%04d.png"),
                    *between, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", os.path.join(out, "garden.mp4")], check=True)
    shutil.rmtree(frames_dir)
    print("film " + os.path.join(out, "garden.mp4"), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
