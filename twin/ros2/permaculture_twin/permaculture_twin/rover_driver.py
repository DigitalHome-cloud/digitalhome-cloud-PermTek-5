# SPDX-License-Identifier: GPL-3.0-or-later
"""Webots driver plugin of an explorer rover: the simulated devices as ROS 2 topics.

It knows nothing about the mission. On a real rover a hardware driver
publishes and subscribes the same topics, under /<rover name>/:

  out  wheel_encoders  sensor_msgs/JointState     wheel angles fl, fr, rl, rr (rad); published LAST each step
       imu             sensor_msgs/Imu            orientation
       gnss/position   geometry_msgs/PointStamped antenna position, local ENU m
       range/<name>    sensor_msgs/Range          front and drop distance sensors, m
       ir/rx           std_msgs/UInt8MultiArray   one IR frame heard from a post
  in   cmd_wheels      std_msgs/Float64MultiArray [left, right] rad/s, [2] = time of the sensors it was computed from
       ir/tx           std_msgs/UInt8MultiArray   one IR frame to send to a post (sent before cmd_wheels)

Every message is stamped with the simulation time of the step it was read in.

Lockstep: after publishing a step's sensors the driver waits for the command
computed from exactly those readings and applies it in the same step, as
the plain Webots controller does. Webots waits for the driver, so the
mission node cannot fall behind the physics, however fast the simulation
runs (ADR 0007, step 1 work item 6: free-running lag was 2-3 steps).
Before the first step it waits for the mission node to subscribe, so the
mission sees every step from the start.
"""
import math
import os
import sys

import rclpy
from geometry_msgs.msg import PointStamped
from sensor_msgs.msg import Imu, JointState, Range
from std_msgs.msg import Float64MultiArray, UInt8MultiArray

from .spin import Drain

sys.path.insert(0, os.environ.get("PERMA_TWIN_ROOT", os.getcwd()))
from stigmergy.mission import quat_to_rpy  # noqa: E402

LOCKSTEP_TIMEOUT_S = 2.0          # wall clock; a node that stops answering is reported, not waited for
STARTUP_TIMEOUT_S = 60.0          # wall clock for the mission node to come up
WHEELS = ("fl", "fr", "rl", "rr")
RANGES = ("ds_front_left", "ds_front_center", "ds_front_right", "drop_left", "drop_right")


def rx_bytes(r):
    return r.getBytes() if hasattr(r, "getBytes") else r.getData()


class RoverDriver:
    def init(self, webots_node, properties):
        self.robot = webots_node.robot
        self.name = self.robot.getName()
        self.ts = int(self.robot.getBasicTimeStep())
        dev = self.robot.getDevice
        self.wheels = {k: dev(f"wheel_{k}") for k in WHEELS}
        self.encs = {k: dev(f"wheel_{k}_enc") for k in WHEELS}
        for m in self.wheels.values():
            m.setPosition(float("inf"))
            m.setVelocity(0.0)
        for e in self.encs.values():
            e.enable(self.ts)
        self.gps = dev("gps")
        self.gps.enable(self.ts)
        self.imu = dev("imu")
        self.imu.enable(self.ts)
        self.ds = {n: dev(n) for n in RANGES}
        for d in self.ds.values():
            d.enable(self.ts)
        self.ir_tx = dev("ir_tx")
        self.ir_rx = dev("ir_rx")
        self.ir_rx.enable(self.ts)

        if not rclpy.ok():
            rclpy.init(args=None)
        self.node = rclpy.create_node("driver", namespace=f"/{self.name}")
        n = self.node
        self.pub_enc = n.create_publisher(JointState, "wheel_encoders", 10)
        self.pub_imu = n.create_publisher(Imu, "imu", 10)
        self.pub_gnss = n.create_publisher(PointStamped, "gnss/position", 10)
        self.pub_range = {r: n.create_publisher(Range, f"range/{r}", 10) for r in RANGES}
        self.pub_ir = n.create_publisher(UInt8MultiArray, "ir/rx", 50)
        self.drain = Drain(n)
        n.create_subscription(Float64MultiArray, "cmd_wheels", self.drain.wrap(self.on_cmd), 10)
        n.create_subscription(UInt8MultiArray, "ir/tx", self.drain.wrap(self.on_ir_tx), 50)
        self.cmd = (0.0, 0.0)
        self.cmd_t = None
        self.ir_out = []
        self.misses = 0
        self.started = False
        self.n = 0
        self.rpy_err = 0.0

    def on_cmd(self, msg):
        self.cmd = (msg.data[0], msg.data[1])
        if len(msg.data) > 2:
            self.cmd_t = msg.data[2]

    def on_ir_tx(self, msg):
        self.ir_out.append(bytes(msg.data))

    def stamp(self, msg, t):
        msg.header.stamp.sec = int(t)
        msg.header.stamp.nanosec = int(round((t - int(t)) * 1e9)) % 1000000000
        msg.header.frame_id = f"{self.name}/base"
        return msg

    def step(self):
        self.drain()
        t = self.robot.getTime()
        if not self.started:
            self.started = True
            if not self.drain.until(lambda: self.pub_enc.get_subscription_count() > 0, STARTUP_TIMEOUT_S):
                self.node.get_logger().warning("no mission node after "
                                               f"{STARTUP_TIMEOUT_S} s; running without one")
        self.publish_sensors(t)

        # lockstep: wait for the command computed from the sensors just published
        if self.pub_enc.get_subscription_count() > 0 and not self.drain.until(
                lambda: self.cmd_t is not None and self.cmd_t >= t - 1e-9, LOCKSTEP_TIMEOUT_S):
            self.misses += 1
            self.node.get_logger().warning(f"no command for t={t:.3f} after {LOCKSTEP_TIMEOUT_S} s "
                                           f"({self.misses} misses); keeping the last one")

        # apply what the mission decided (held until changed, like a motor controller)
        left, right = self.cmd
        self.wheels["fl"].setVelocity(left)
        self.wheels["rl"].setVelocity(left)
        self.wheels["fr"].setVelocity(right)
        self.wheels["rr"].setVelocity(right)
        for frame in self.ir_out:
            self.ir_tx.send(frame)
        self.ir_out = []

    def publish_sensors(self, t):
        # read and publish the sensors
        while self.ir_rx.getQueueLength() > 0:
            self.pub_ir.publish(UInt8MultiArray(data=list(rx_bytes(self.ir_rx))))
            self.ir_rx.nextPacket()
        for r, d in self.ds.items():
            msg = self.stamp(Range(), t)
            msg.radiation_type = Range.INFRARED
            msg.range = d.getValue() / 1000.0
            msg.min_range, msg.max_range = 0.0, d.getMaxValue() / 1000.0
            self.pub_range[r].publish(msg)
        g = self.gps.getValues()
        if not any(math.isnan(v) for v in g):
            msg = self.stamp(PointStamped(), t)
            msg.point.x, msg.point.y, msg.point.z = g
            self.pub_gnss.publish(msg)
        msg = self.stamp(Imu(), t)
        qx, qy, qz, qw = self.imu.getQuaternion()
        self.n += 1
        if self.n <= 2000:                               # the mission rebuilds roll/pitch/yaw from this: check it
            a, b = quat_to_rpy(qx, qy, qz, qw), self.imu.getRollPitchYaw()
            self.rpy_err = max(self.rpy_err, max(abs(math.remainder(u - v, 2 * math.pi)) for u, v in zip(a, b)))
            if self.n == 2000:
                self.node.get_logger().info(f"imu check: quaternion vs roll/pitch/yaw max diff {self.rpy_err:.2e} rad")
        msg.orientation.x, msg.orientation.y, msg.orientation.z, msg.orientation.w = qx, qy, qz, qw
        self.pub_imu.publish(msg)
        msg = self.stamp(JointState(), t)                # last: the mission node steps on this one
        msg.name = list(WHEELS)
        msg.position = [self.encs[k].getValue() for k in WHEELS]
        self.pub_enc.publish(msg)
