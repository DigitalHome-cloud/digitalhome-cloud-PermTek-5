# SPDX-License-Identifier: GPL-3.0-or-later
"""The explorer's mission as a ROS 2 node: stigmergy.mission over the rover's own topics.

Run one per rover, in the rover's namespace (/rover1, /rover2, ...). It uses
only topics under that namespace, so the same node runs against the Webots
driver plugin or a real rover's drivers. It never reads another rover:
rovers meet only in the store (synced at the nest) and on the IR posts.

  in   wheel_encoders  imu  gnss/position  range/<name>  ir/rx     (rover driver)
       gnss/status  soil  uwb/ranges                               (field sensors)
  out  cmd_wheels  ir/tx  pose  state

The node runs one mission step per encoder message: the driver publishes the
encoders last, so each step sees the sensors of one simulation step. The
driver waits for cmd_wheels (published last here) before Webots moves on.
"""
import json
import math
import os
import sys

import rclpy
from geometry_msgs.msg import PointStamped, PoseWithCovarianceStamped
from rclpy.node import Node
from sensor_msgs.msg import Imu, JointState, Range
from std_msgs.msg import Float64MultiArray, String, UInt8MultiArray

sys.path.insert(0, os.environ.get("PERMA_TWIN_ROOT", os.getcwd()))
from stigmergy import common as sc  # noqa: E402
from stigmergy.mission import RANGES, WHEELS, Inputs, Mission, quat_to_rpy  # noqa: E402


def stamp_s(header):
    return header.stamp.sec + header.stamp.nanosec * 1e-9


class ExplorerNode(Node):
    def __init__(self):
        super().__init__("explorer")
        self.rover = self.get_namespace().strip("/")
        if not self.rover:
            raise SystemExit("run the explorer in the rover's namespace, e.g. --ros-args -r __ns:=/rover1")
        cfg = sc.load_config()
        self.mission = Mission(cfg, self.rover, sc.Store(self.rover),
                               log=lambda s: print(s, flush=True))
        self.rpy = (0.0, 0.0, 0.0)
        self.gnss = None                 # (t, (x, y, z))
        self.ranges = {n: 1000.0 for n in RANGES}
        self.field = {}                  # stamp -> {"rtk", "soil", "uwb", "h"} readings from the field
        self.ir = []

        self.pub_cmd = self.create_publisher(Float64MultiArray, "cmd_wheels", 10)
        self.pub_ir = self.create_publisher(UInt8MultiArray, "ir/tx", 50)
        self.pub_pose = self.create_publisher(PoseWithCovarianceStamped, "pose", 10)
        self.pub_state = self.create_publisher(String, "state", 10)
        self.create_subscription(Imu, "imu", self.on_imu, 10)
        self.create_subscription(PointStamped, "gnss/position", self.on_gnss, 10)
        for n in RANGES:
            self.create_subscription(Range, f"range/{n}", lambda m, n=n: self.ranges.__setitem__(n, m.range * 1000.0), 10)
        self.create_subscription(UInt8MultiArray, "ir/rx", lambda m: self.ir.append(bytes(m.data)), 50)
        self.create_subscription(String, "gnss/status", lambda m: self.on_field(m, "rtk", "rtk"), 10)
        self.create_subscription(String, "soil", lambda m: self.on_field(m, "soil", "value"), 10)
        self.create_subscription(String, "uwb/ranges", self.on_uwb, 10)
        self.create_subscription(JointState, "wheel_encoders", self.on_encoders, 10)

    def on_imu(self, m):
        o = m.orientation
        self.rpy = quat_to_rpy(o.x, o.y, o.z, o.w)

    def on_gnss(self, m):
        self.gnss = (stamp_s(m.header), (m.point.x, m.point.y, m.point.z))

    def on_field(self, m, key, field):
        d = json.loads(m.data)
        self.field.setdefault(d["stamp"], {})[key] = d[field]

    def on_uwb(self, m):
        d = json.loads(m.data)
        self.field.setdefault(d["stamp"], {}).update(uwb=d["ranges"], h=d["h"])

    def due_field(self, t):
        """Readings taken in earlier steps, oldest first (the plain controller's radio is one step late too)."""
        due = sorted(k for k in self.field if k < t - 1e-9)
        return [self.field.pop(k) for k in due]

    def on_encoders(self, m):
        t = stamp_s(m.header)
        enc = dict(zip(m.name, m.position))
        gnss = self.gnss[1] if self.gnss and abs(self.gnss[0] - t) < 1e-6 else None   # only a fix from this step
        out = self.mission.step(Inputs(t=t, encoders=[enc[k] for k in WHEELS], rpy=self.rpy, gnss=gnss,
                                       ranges=dict(self.ranges), field_msgs=self.due_field(t), ir_frames=self.ir))
        self.ir = []
        for frame in out.ir_frames:                      # before the command: the driver applies both in this step
            self.pub_ir.publish(UInt8MultiArray(data=list(frame)))
        if out.pose:
            msg = PoseWithCovarianceStamped()
            msg.header = m.header
            msg.header.frame_id = "garden"
            msg.pose.pose.position.x, msg.pose.pose.position.y = out.pose["x"], out.pose["y"]
            yaw = self.rpy[2]
            msg.pose.pose.orientation.z, msg.pose.pose.orientation.w = math.sin(yaw / 2), math.cos(yaw / 2)
            msg.pose.covariance[0] = msg.pose.covariance[7] = out.pose["sigma"] ** 2
            self.pub_state.publish(String(data=out.pose["state"]))
            self.pub_pose.publish(msg)
        self.pub_cmd.publish(Float64MultiArray(data=[float(out.wheels[0]), float(out.wheels[1]), t]))


def main():
    rclpy.init()
    node = ExplorerNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
