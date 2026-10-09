#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Summarise a run: what the swarm wrote into the shared medium, and how well it knew where it was.

Run from the project root after (or during) a simulation:  python3 tools/report.py
"""
import csv
import glob
import json
import math
import os
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data")

recs = []
for p in glob.glob(os.path.join(DATA, "store_*.jsonl")):
    with open(p) as fh:
        recs += [json.loads(line) for line in fh if line.strip()]

print("== Traces written ==")
for (agent, rtype), n in sorted(Counter((r["agent"], r["type"]) for r in recs).items()):
    print(f"  {agent:8s} {rtype:15s} {n}")

print("\n== Visits per post (who) ==")
visits = defaultdict(Counter)
for r in recs:
    if r["type"] == "visit":
        visits[r["post"]][r["agent"]] += 1
for pid in sorted(visits):
    print(f"  post {pid}: " + ", ".join(f"{a} x{n}" for a, n in sorted(visits[pid].items())))

print("\n== Suggested interventions ==")
seen = set()
for r in sorted((r for r in recs if r["type"] == "intervention"), key=lambda r: r["t_h"]):
    key = (r["interventionType"], r["target"])
    if key not in seen:
        seen.add(key)
        print(f"  h={r['t_h']:5.1f} {r['interventionType']:10s} {r['target']:22s} ({r['reason']}) by {r['agent']}")

print("\n== Soil moisture by post (latest) ==")
latest = {}
for r in recs:
    if r["type"] == "observation" and r["property"] == "soilMoisture":
        if r["post"] not in latest or r["t_h"] > latest[r["post"]]["t_h"]:
            latest[r["post"]] = r
for pid in sorted(latest):
    r = latest[pid]
    print(f"  post {pid}: {r['value']:.1f} % at h={r['t_h']:.1f} (by {r['agent']}, sigma {r['sigma']} m)")

recal = [r["correction_m"] for r in recs if r["type"] == "recalibration"]
if recal:
    print(f"\n== Docking recalibration: {len(recal)} dockings, mean correction {sum(recal) / len(recal):.3f} m, "
          f"max {max(recal):.3f} m")

path = os.path.join(DATA, "truth_log.csv")
if os.path.exists(path):
    errs = defaultdict(list)
    with open(path) as fh:
        for row in csv.DictReader(fh):
            errs[row["rover"]].append(float(row["error_m"]))
    print("\n== Position error vs ground truth ==")
    for rover, e in sorted(errs.items()):
        e.sort()
        print(f"  {rover}: mean {sum(e) / len(e):.3f} m, 95th pct {e[int(0.95 * (len(e) - 1))]:.3f} m, "
              f"max {e[-1]:.3f} m ({len(e)} samples)")

# ------------------------------------------------------------------ frame and exploration (step 2)
print("\n== Exploration ==")
covered_t = {}
for r in sorted((r for r in recs if r["type"] == "covered"), key=lambda r: r["t_h"]):
    covered_t.setdefault(r["cell"], r["t_h"])
done = [r for r in recs if r["type"] == "explore_done"]
if done:
    first = min(done, key=lambda r: r["t_h"])
    print(f"  complete at h={first['t_h']:.1f}: {first['cells']} cells (first: {first['agent']})")
elif covered_t:
    print(f"  not complete: {len(covered_t)} cells covered so far, last at h={max(covered_t.values()):.1f}")
by_agent = Counter(r["agent"] for r in recs if r["type"] == "covered")
if by_agent:
    print("  covered traces: " + ", ".join(f"{a} {n}" for a, n in sorted(by_agent.items())))

print("\n== Findings vs hidden objects ==")
sightings = [r for r in recs if r["type"] == "sighting"]
findings = [r for r in recs if r["type"] == "finding"]
truth_path = os.path.join(ROOT, "worlds", "truth.json")
hidden = json.load(open(truth_path))["hidden"] if os.path.exists(truth_path) else []
explained = set()
for u in hidden:
    ux, uy = u["pos"]
    seen = sorted((r for r in sightings if math.hypot(r["x"] - ux, r["y"] - uy) <= 1.0), key=lambda r: r["t_h"])
    conf = [r for r in findings if math.hypot(r["x"] - ux, r["y"] - uy) <= 1.0]
    explained.update(id(r) for r in seen + conf)
    if not seen:
        print(f"  {u.get('kind', 'object'):7s} at ({ux:6.1f}, {uy:6.1f}): NOT SEEN")
        continue
    d = min(math.hypot(r["x"] - ux, r["y"] - uy) for r in seen)
    state = (f"finding at h={min(r['t_h'] for r in conf):.1f} ({conf[0]['sightings']} sightings)" if conf
             else "sighted only, not yet confirmed")
    print(f"  {u.get('kind', 'object'):7s} at ({ux:6.1f}, {uy:6.1f}): first seen by {seen[0]['agent']} at "
          f"h={seen[0]['t_h']:.1f}, best {d:.2f} m off; {state}")
other_s = [r for r in sightings if id(r) not in explained]
other_f = [r for r in findings if id(r) not in explained]
print(f"  other sightings (rovers, false alarms): {len(other_s)}; other findings: {len(other_f)}"
      + "".join(f"\n    finding at ({r['x']:.1f}, {r['y']:.1f}) h={r['t_h']:.1f}" for r in other_f))

print("\n== Frame ==")
fpath = os.path.join(DATA, "frame_log.csv")
if os.path.exists(fpath):
    with open(fpath) as fh:
        rows = list(csv.DictReader(fh))
    if rows:
        for rover, n in sorted(Counter(r["rover"] for r in rows).items()):
            first = next(r for r in rows if r["rover"] == rover)
            print(f"  {rover}: {n} samples OUTSIDE the frame, first at h={float(first['garden_h']):.1f} "
                  f"({float(first['true_x']):.1f}, {float(first['true_y']):.1f})")
    else:
        print("  no violation: every rover stayed inside the geofence and out of the no-go areas")
