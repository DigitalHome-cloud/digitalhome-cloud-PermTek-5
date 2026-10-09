# SPDX-License-Identifier: GPL-3.0-or-later
"""IR marker post: a writable trace fixed in the garden.

Broadcasts two frames in turn (every 250 ms):
  STATUS  garden minutes since the last inspection (0xFFFF = never)
  MOIST   last soil moisture written by a rover (0.1 %)
Accepts WRITE frames addressed to its id: "inspected now, moisture = v".
The post holds only its own spot's memory; nothing else.
"""
import os
import sys

from controller import Robot

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from stigmergy import common as sc  # noqa: E402

cfg = sc.load_config()
robot = Robot()
ts = int(robot.getBasicTimeStep())
post_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1

tx = robot.getDevice("ir_tx")
rx = robot.getDevice("ir_rx")
rx.enable(ts)

last_inspected_min = None
moisture10 = 0
toggle = False
next_send = 0.0


def garden_min():
    return robot.getTime() * cfg["time_scale"] / 60.0


def rx_bytes(r):
    return r.getBytes() if hasattr(r, "getBytes") else r.getData()


while robot.step(ts) != -1:
    while rx.getQueueLength() > 0:
        fr = sc.decode_frame(rx_bytes(rx))
        rx.nextPacket()
        if fr and fr[0] == post_id and fr[1] == sc.T_WRITE:
            last_inspected_min = garden_min()
            moisture10 = fr[2]
    if robot.getTime() >= next_send:
        next_send = robot.getTime() + 0.25
        toggle = not toggle
        if toggle:
            age = sc.NEVER if last_inspected_min is None else min(0xFFFE, garden_min() - last_inspected_min)
            tx.send(sc.encode_frame(post_id, sc.T_STATUS, age))
        else:
            tx.send(sc.encode_frame(post_id, sc.T_MOIST, moisture10))
