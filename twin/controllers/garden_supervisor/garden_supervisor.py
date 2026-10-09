# SPDX-License-Identifier: GPL-3.0-or-later
"""The garden, plain Webots controller: stigmergy.garden over the radio.

Readings go to the rovers on radio channel 5 as JSON {"to": name, ...};
rovers report their estimated pose on channel 6 for the truth log.
The ROS 2 path (ros2/permaculture_twin) wraps the same Garden.
"""
import json
import os
import sys

from controller import Supervisor

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from stigmergy import common as sc  # noqa: E402
from stigmergy.garden import Garden  # noqa: E402

cfg = sc.load_config()
sup = Supervisor()
ts = int(sup.getBasicTimeStep())
tx = sup.getDevice("radio_tx")
rx = sup.getDevice("radio_rx")
rx.enable(ts)


def rx_bytes(r):
    return r.getBytes() if hasattr(r, "getBytes") else r.getData()


def send(rover, msg):
    tx.send(json.dumps(dict(msg, to=rover)).encode())


garden = Garden(sup, cfg, send)
while sup.step(ts) != -1:
    garden.step()
    while rx.getQueueLength() > 0:
        try:
            m = json.loads(rx_bytes(rx).decode())
        except ValueError:
            m = None
        rx.nextPacket()
        garden.pose(m)
