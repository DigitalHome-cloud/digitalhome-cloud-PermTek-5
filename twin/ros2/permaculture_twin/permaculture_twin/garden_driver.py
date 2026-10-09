# SPDX-License-Identifier: GPL-3.0-or-later
"""Webots driver plugin of the garden supervisor: stigmergy.garden over ROS 2.

The garden plays what the rovers' own devices cannot see in simulation, and
publishes it as the sensors that would measure it on a real rover:

  /clock                     rosgraph_msgs/Clock         simulation time, every step
  /<rover>/gnss/status       std_msgs/String  JSON {"stamp": s, "rtk": "fix" | "float"} (RTK under the oaks)
  /<rover>/soil              std_msgs/String  JSON {"stamp": s, "value": %} soil probe
  /<rover>/uwb/ranges        std_msgs/String  JSON {"stamp": s, "h": garden h, "ranges": [[anchor id, m], ...]}

Readings carry the simulation time they were taken at; the rover applies them
one step later, as the radio of the plain controller delivers them. (JSON in
String until the twin has its own message package, step 2.)
  in /<rover>/pose           geometry_msgs/PoseWithCovarianceStamped  estimate, for the truth log
  in /<rover>/state          std_msgs/String             mission state, for the truth log

The garden is not a rover: it may publish into every rover's namespace.
"""
import json
import math
import os
import sys

import rclpy
from geometry_msgs.msg import PoseWithCovarianceStamped
from rosgraph_msgs.msg import Clock
from std_msgs.msg import String

sys.path.insert(0, os.environ.get("PERMA_TWIN_ROOT", os.getcwd()))
from stigmergy import common as sc  # noqa: E402
from stigmergy.garden import Garden  # noqa: E402

from .spin import Drain


class GardenDriver:
    def init(self, webots_node, properties):
        self.sup = webots_node.robot
        self.cfg = sc.load_config()
        if not rclpy.ok():
            rclpy.init(args=None)
        self.node = rclpy.create_node("garden")
        n = self.node
        self.pub_clock = n.create_publisher(Clock, "/clock", 10)
        self.pubs = {}
        self.states = {}
        self.drain = Drain(n)
        for name in self.cfg["rovers"]:
            self.pubs[name] = (n.create_publisher(String, f"/{name}/gnss/status", 10),
                               n.create_publisher(String, f"/{name}/soil", 10),
                               n.create_publisher(String, f"/{name}/uwb/ranges", 10))
            n.create_subscription(PoseWithCovarianceStamped, f"/{name}/pose",
                                  self.drain.wrap(lambda msg, name=name: self.on_pose(name, msg)), 10)
            n.create_subscription(String, f"/{name}/state",
                                  self.drain.wrap(lambda msg, name=name: self.states.__setitem__(name, msg.data)), 10)
        self.garden = Garden(self.sup, self.cfg, self.send, log=lambda s: print(s, flush=True))

    def send(self, rover, msg):
        status, soil, uwb = self.pubs[rover]
        t = self.sup.getTime()
        status.publish(String(data=json.dumps({"stamp": t, "rtk": msg["rtk"]})))
        soil.publish(String(data=json.dumps({"stamp": t, "value": msg["soil"]})))
        uwb.publish(String(data=json.dumps({"stamp": t, "h": msg["h"], "ranges": msg["uwb"]})))

    def on_pose(self, name, msg):
        p = msg.pose.pose.position
        self.garden.pose({"name": name, "x": p.x, "y": p.y, "sigma": math.sqrt(max(0.0, msg.pose.covariance[0])),
                          "state": self.states.get(name, "")})

    def step(self):
        t = self.sup.getTime()
        clock = Clock()
        clock.clock.sec = int(t)
        clock.clock.nanosec = int(round((t - int(t)) * 1e9)) % 1000000000
        self.pub_clock.publish(clock)
        self.garden.step()
        self.drain()
