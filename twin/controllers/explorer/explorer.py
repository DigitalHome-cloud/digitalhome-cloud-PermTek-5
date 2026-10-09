# SPDX-License-Identifier: GPL-3.0-or-later
"""Explorer rover, plain Webots controller: devices in, stigmergy.mission out.

All the decisions are in stigmergy/mission.py; this file only reads the
devices, hands them to the mission each step and applies what it decides.
The ROS 2 path (ros2/permaculture_twin) wraps the same mission.
"""
import json
import os
import sys

from controller import Robot

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from stigmergy import common as sc  # noqa: E402
from stigmergy.mission import RANGES, WHEELS, Inputs, Mission  # noqa: E402

cfg = sc.load_config()
robot = Robot()
TS = int(robot.getBasicTimeStep())
NAME = robot.getName()

dev = robot.getDevice
wheels = {k: dev(f"wheel_{k}") for k in WHEELS}
encs = {k: dev(f"wheel_{k}_enc") for k in WHEELS}
for m in wheels.values():
    m.setPosition(float("inf"))
    m.setVelocity(0.0)
for e in encs.values():
    e.enable(TS)
gps = dev("gps")
gps.enable(TS)
imu = dev("imu")
imu.enable(TS)
ds = {n: dev(n) for n in RANGES}
for d in ds.values():
    d.enable(TS)
cam = dev("camera")
cam.enable(TS * 10)
ir_tx = dev("ir_tx")
ir_rx = dev("ir_rx")
ir_rx.enable(TS)
radio_rx = dev("radio_rx")
radio_rx.enable(TS)
radio_tx = dev("radio_tx")


def rx_bytes(r):
    return r.getBytes() if hasattr(r, "getBytes") else r.getData()


def drain(receiver):
    while receiver.getQueueLength() > 0:
        yield rx_bytes(receiver)
        receiver.nextPacket()


def field_msgs():
    """The field's messages for this rover (RTK status, UWB ranges, soil probe), sent by the garden."""
    out = []
    for data in drain(radio_rx):
        try:
            m = json.loads(data.decode())
        except ValueError:
            continue
        if m and m.get("to") == NAME:
            out.append(m)
    return out


mission = Mission(cfg, NAME, sc.Store(NAME))

while robot.step(TS) != -1:
    out = mission.step(Inputs(
        t=robot.getTime(),
        encoders=[encs[k].getValue() for k in WHEELS],
        rpy=tuple(imu.getRollPitchYaw()),
        gnss=tuple(gps.getValues()),
        ranges={n: d.getValue() for n, d in ds.items()},
        field_msgs=field_msgs(),
        ir_frames=list(drain(ir_rx)),
    ))
    left, right = out.wheels
    wheels["fl"].setVelocity(left)
    wheels["rl"].setVelocity(left)
    wheels["fr"].setVelocity(right)
    wheels["rr"].setVelocity(right)
    for frame in out.ir_frames:
        ir_tx.send(frame)
    if out.pose:
        radio_tx.send(json.dumps(out.pose).encode())
