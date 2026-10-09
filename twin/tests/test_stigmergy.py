# SPDX-License-Identifier: GPL-3.0-or-later
"""Tests of the simulator-free logic: no Webots, no ROS.   pytest -q tests"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from stigmergy import common as sc  # noqa: E402
from stigmergy.mission import RANGES, Inputs, Mission, lever_arm  # noqa: E402


# ------------------------------------------------------------------ IR frame
def test_frame_round_trip():
    for pid, ftype, val in [(1, sc.T_STATUS, 0), (6, sc.T_MOIST, 153), (255, sc.T_WRITE, sc.NEVER)]:
        assert sc.decode_frame(sc.encode_frame(pid, ftype, val)) == (pid, ftype, val)


def test_frame_rejects_corruption():
    data = bytearray(sc.encode_frame(3, sc.T_MOIST, 200))
    data[2] ^= 0x10
    assert sc.decode_frame(bytes(data)) is None
    assert sc.decode_frame(b"\x00\x01") is None


# ------------------------------------------------------------------ decay
def test_weight_half_life():
    assert sc.weight(0, 12) == 1.0
    assert sc.weight(12, 12) == pytest.approx(0.5)
    assert sc.weight(24, 12) == pytest.approx(0.25)
    assert sc.weight(None, 12) == 0.0          # never seen: no weight, maximum need


# ------------------------------------------------------------------ UWB
ANCHORS = {1: (0.0, 0.0), 2: (10.0, 0.0), 3: (10.0, 10.0), 4: (0.0, 10.0)}


def ranges_to(x, y, moved=None):
    ms = []
    for aid, (ax, ay) in ANCHORS.items():
        r = math.hypot(x - ax, y - ay)
        if aid == moved:
            r += 1.5                               # the anchor is not where the map says
        ms.append((aid, ax, ay, r))
    return ms


def test_uwb_fix_clean():
    x, y, rms, outlier = sc.uwb_fix(ranges_to(3.0, 4.0))
    assert (x, y) == (pytest.approx(3.0, abs=0.01), pytest.approx(4.0, abs=0.01))
    assert outlier is None


def test_uwb_fix_finds_moved_anchor():
    x, y, rms, outlier = sc.uwb_fix(ranges_to(3.0, 4.0, moved=3))
    assert outlier == 3
    assert math.hypot(x - 3.0, y - 4.0) < 0.1


# ------------------------------------------------------------------ lever arm
def test_lever_arm_flat_is_zero():
    assert lever_arm(0.0, 0.0, 1.0) == (pytest.approx(0.0), pytest.approx(0.0))


def test_lever_arm_on_slope():
    # pitched 24 deg nose-down while heading east: the mast leans ~0.39 m east
    ox, oy = lever_arm(0.0, math.radians(24), 0.0)
    assert ox == pytest.approx(0.95 * math.sin(math.radians(24)), abs=1e-6)
    assert oy == pytest.approx(0.0, abs=1e-9)


# ------------------------------------------------------------------ paths
CFG_PATH = {
    "uphill": [0.0, 1.0],
    "contours": [{"a": [-10.0, 0.0], "b": [10.0, 0.0], "crossings": [[4.0, 0.0]]}],
    "obstacles": [],
}


def test_path_crosses_fascine_only_at_passage():
    wps = sc.plan_path(CFG_PATH, (-5.0, -5.0), (-5.0, 5.0))
    assert wps[-1] == (-5.0, 5.0)
    assert (4.0, -1.8) in wps and (4.0, 1.8) in wps           # down side, then up side of the passage


def test_path_without_crossing_is_direct():
    assert sc.plan_path(CFG_PATH, (-5.0, 2.0), (5.0, 3.0)) == [(5.0, 3.0)]


def test_path_detours_known_obstacle():
    cfg = dict(CFG_PATH, contours=[], obstacles=[[0.0, 3.0, 0.5]])
    wps = sc.plan_path(cfg, (-5.0, 3.0), (5.0, 3.0))
    assert len(wps) == 2
    assert abs(wps[0][1] - 3.0) >= 0.5 + 0.8                  # passes the obstacle with clearance


# ------------------------------------------------------------------ store and claims
def test_claims_lease_and_release(tmp_path):
    a = sc.Store("rover1", data_dir=str(tmp_path))
    b = sc.Store("rover2", data_dir=str(tmp_path))
    a.write({"type": "claim", "post": 3, "t_h": 1.0, "expires_h": 13.0})
    b.sync()
    assert b.active_claims(5.0, exclude_agent="rover2") == {3: "rover1"}
    assert b.active_claims(14.0, exclude_agent="rover2") == {}          # lease ran out
    a.write({"type": "release", "post": 3, "t_h": 2.0})
    b.sync()
    assert b.active_claims(5.0, exclude_agent="rover2") == {}           # released early


def test_stores_meet_only_through_sync(tmp_path):
    a = sc.Store("rover1", data_dir=str(tmp_path))
    b = sc.Store("rover2", data_dir=str(tmp_path))
    a.write({"type": "visit", "post": 1, "t_h": 4.0})
    assert b.last_visit_h(1) is None                                     # not yet at the nest
    assert b.sync() == 1
    assert b.last_visit_h(1) == 4.0


# ------------------------------------------------------------------ mission
def mission_cfg():
    return {
        "time_scale": 120,
        "half_lives_h": {"soilMoisture": 12.0, "visit": 12.0, "airTemperature": 0.5, "phenology": 120.0},
        "terrain": {"z_ref": 0.0, "ref": [0.0, 0.0], "grad": [0.0, 0.0]},
        "uphill": [0.0, 1.0],
        "contours": [],
        "obstacles": [],
        "anchors": [],
        "docks": {"rover1": [0.0, 0.0, 0.0], "rover2": [0.0, 1.6, 0.0]},
        "posts": [{"id": i, "label": f"p{i}", "zone": "zone2", "pos": [5.0 * i, 0.0], "stand": [5.0 * i, -1.0]}
                  for i in (1, 2, 3, 4)],
    }


def idle(t, frames=()):
    return Inputs(t=t, encoders=[0.0] * 4, rpy=(0.0, 0.0, 0.0), gnss=None,
                  ranges={n: 1000.0 for n in RANGES}, ir_frames=list(frames))


def test_mission_waits_then_claims_three_posts(tmp_path):
    store = sc.Store("rover1", data_dir=str(tmp_path))
    m = Mission(mission_cfg(), "rover1", store, log=lambda s: None)
    m.step(idle(1.0))
    assert m.state == "DOCKED"                                           # start delay is 5 s
    m.step(idle(5.1))
    assert m.state == "UNDOCK"
    claims = [r["post"] for r in store.records("claim")]
    assert len(claims) == 3 and claims == [pid for _, pid in m.route]    # claimed, nearest first
    out = m.step(idle(5.2))
    assert out.wheels == (-2.0, -2.0)                                    # reverses out of the nest


def test_mission_skips_posts_claimed_by_another_rover(tmp_path):
    other = sc.Store("rover2", data_dir=str(tmp_path))
    other.write({"type": "claim", "post": 1, "t_h": 0.0, "expires_h": 12.0})
    other.write({"type": "claim", "post": 2, "t_h": 0.0, "expires_h": 12.0})
    m = Mission(mission_cfg(), "rover1", sc.Store("rover1", data_dir=str(tmp_path)), log=lambda s: None)
    m.step(idle(5.1))
    assert sorted(pid for _, pid in m.route) == [3, 4]


def test_mission_reports_pose_once_a_second(tmp_path):
    m = Mission(mission_cfg(), "rover1", sc.Store("rover1", data_dir=str(tmp_path)), log=lambda s: None)
    poses = [m.step(idle(t / 10)).pose for t in range(0, 25)]
    assert sum(p is not None for p in poses) == 3                        # t = 0, 1, 2


def test_mission_hears_post_status_over_ir(tmp_path):
    m = Mission(mission_cfg(), "rover1", sc.Store("rover1", data_dir=str(tmp_path)), log=lambda s: None)
    m.step(idle(1.0, frames=[sc.encode_frame(2, sc.T_STATUS, 30)]))
    assert m.ir_seen[2]["age_min"] == 30 and m.heard(2)
    m.step(idle(3.0))
    assert not m.heard(2)


def test_quat_to_rpy_round_trip():
    from stigmergy.mission import quat_to_rpy
    r, p, y = 0.2, -0.35, 2.5
    cr, sr, cp, sp, cy, sy = (math.cos(r / 2), math.sin(r / 2), math.cos(p / 2), math.sin(p / 2),
                              math.cos(y / 2), math.sin(y / 2))
    q = (sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy, cr * cp * cy + sr * sp * sy)
    assert quat_to_rpy(*q) == (pytest.approx(r), pytest.approx(p), pytest.approx(y))


# ------------------------------------------------------------------ frame and planner (step 2)
def frame_cfg(no_go=(), obstacles=(), grade=0.45):
    return {
        "frame": {"geofence": [[0, 0], [30, 0], [30, 20], [0, 20]], "no_go": list(no_go)},
        "uphill": [0.0, 1.0], "terrain": {"grade": grade}, "obstacles": list(obstacles),
    }


def test_in_frame_respects_geofence_and_no_go():
    from stigmergy.nav import in_frame
    cfg = frame_cfg(no_go=[{"label": "pond", "circle": [10, 10], "r": 2}])
    assert in_frame(cfg, 5, 5)
    assert not in_frame(cfg, -1, 5)                   # outside the geofence
    assert not in_frame(cfg, 10.5, 10)                # in the no-go circle


def test_plan_stays_inside_the_frame_around_a_no_go_wall():
    from stigmergy.nav import NavGrid, in_frame
    wall = {"label": "bank", "polygon": [[14, -1], [16, -1], [16, 16], [14, 16]]}   # gap only at the top
    cfg = frame_cfg(no_go=[wall])
    grid = NavGrid(cfg)
    path = grid.plan((5, 5), (25, 5))
    assert path is not None and path[-1] == (25, 5)
    pts = [(5, 5)] + path
    for a, b in zip(pts, pts[1:]):                     # every leg, sampled, stays in the frame
        for k in range(11):
            x, y = a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10
            assert in_frame(cfg, x, y), (x, y)
    assert max(p[1] for p in path) > 16                # it had to go round the top of the bank


def test_plan_goes_along_contours_not_diagonally():
    from stigmergy.nav import NavGrid
    grid = NavGrid(frame_cfg())
    path = [(3, 3)] + grid.plan((3, 3), (25, 15))
    for a, b in zip(path, path[1:]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy)
        if d > 2.0:                                    # long legs: along the contour (x) or the fall line (y)
            assert abs(dy) / d < 0.35 or abs(dx) / d < 0.35, (a, b)


def test_unreachable_goal_and_findings_block_cells():
    from stigmergy.nav import NavGrid
    grid = NavGrid(frame_cfg(no_go=[{"label": "pond", "circle": [10, 10], "r": 3}]))
    assert grid.plan((2, 2), (10, 10)) is not None     # snaps to the nearest drivable cell
    assert grid.plan((2, 2), (60, 60)) is None         # far outside the frame
    i, j = grid.cell(20, 5)
    assert grid.is_free(i, j)
    grid.add_obstacle(20, 5, 0.3)
    assert not grid.is_free(i, j)


def test_explore_claims_uncovered_cells_and_switches_to_posts(tmp_path):
    cfg = dict(mission_cfg(), **frame_cfg())
    cfg["mission"] = {"explore_first": True, "cell_m": 10.0}
    cfg["docks"] = {"rover1": [2.0, 2.0, 0.0], "rover2": [2.0, 4.0, 0.0]}
    store = sc.Store("rover1", data_dir=str(tmp_path))
    m = Mission(cfg, "rover1", store, log=lambda s: None)
    assert m.mode == "explore" and len(m.cells) == 6   # 30 x 20 m in 10 m cells
    m.step(idle(5.1))
    assert [k for k, _ in m.route] == ["cell"] * 6
    for c in m.cells:                                  # someone covered everything
        store.write({"type": "covered", "cell": c, "t_h": 1.0})
    m.state, m.route = "DOCKED", []
    m.state_t, m.dock_wait = 0.0, 0.0
    m.step(idle(6.0))
    assert m.mode == "posts" and all(k == "post" for k, _ in m.route)
    assert any(r["type"] == "explore_done" for r in store.records())


def test_edge_margin_is_wider_on_the_downhill_side():
    from stigmergy.nav import NavGrid
    for fence in ([[0, 0], [30, 0], [30, 20], [0, 20]], [[0, 0], [0, 20], [30, 20], [30, 0]]):   # both orientations
        cfg = frame_cfg()
        cfg["frame"]["geofence"] = fence
        grid = NavGrid(cfg)
        assert grid.in_frame_margin(15, 20 - 1.1)          # uphill edge: 0.8 m is enough (0.5 m cells)
        assert not grid.in_frame_margin(15, 0.9)           # downhill edge: the rover would slide out
        assert grid.in_frame_margin(15, 1.4)


def test_vegetation_blocks_and_slows_the_planner():
    from stigmergy.nav import NavGrid
    hedge = {"id": "h", "class": "hedge", "polygon": [[14, -1], [16, -1], [16, 16], [14, 16]]}
    grass = {"id": "g", "class": "tall_grass", "polygon": [[5, 5], [25, 5], [25, 15], [5, 15]]}
    cfg = dict(frame_cfg(grade=0.0), vegetation=[hedge, grass])
    grid = NavGrid(cfg)
    assert not grid.drivable(15, 5)                    # never into a hedge
    path = [(5, 3)] + grid.plan((5, 3), (25, 3))
    assert max(p[1] for p in path) > 16                # round the end of the hedge
    assert grid.cost[grid.cell(10, 10)[1] * grid.nx + grid.cell(10, 10)[0]] == 1.6


def test_unknown_vegetation_class_is_refused():
    from stigmergy.vegetation import props
    with pytest.raises(ValueError):
        props({"class": "jungle"})
