# SPDX-License-Identifier: GPL-3.0-or-later
"""Launch test: start the twin, let both rovers run a mission, check that no rover
node publishes, subscribes, serves or calls under another rover's namespace.

    python3 tools/generate_world.py --ros
    launch_test ros2/permaculture_twin/test/test_isolation.py      # from twin/, with the workspace sourced
"""
import os
import sys
import time
import unittest

import launch_testing
import pytest
import rclpy
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource

ROOT = os.environ.get("PERMA_TWIN_ROOT", os.getcwd())
sys.path.insert(0, os.path.join(ROOT, "tools"))
from check_isolation import check  # noqa: E402


@pytest.mark.launch_test
def generate_test_description():
    launch = os.path.join(get_package_share_directory("permaculture_twin"), "launch", "twin.launch.py")
    return LaunchDescription([
        IncludeLaunchDescription(PythonLaunchDescriptionSource(launch), launch_arguments={"twin_root": ROOT}.items()),
        launch_testing.actions.ReadyToTest(),
    ])


class TestIsolation(unittest.TestCase):
    def test_rovers_stay_in_their_namespace(self):
        time.sleep(30.0)                       # drivers connected, missions planned, posts claimed
        rclpy.init()
        node = rclpy.create_node("isolation_test")
        try:
            seen, problems = check(node, {"rover1", "rover2"})
        finally:
            node.destroy_node()
            rclpy.shutdown()
        self.assertGreaterEqual(seen, 6, "expected driver, plugin and mission node for both rovers")
        self.assertEqual(problems, [])
