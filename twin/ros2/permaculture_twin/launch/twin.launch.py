# SPDX-License-Identifier: GPL-3.0-or-later
"""Run the twin on ROS 2: Webots, the garden plugin, and per rover a driver plugin and a mission node.

    python3 tools/generate_world.py --ros [--site ...]      # once: writes worlds/site_ros.wbt
    ros2 launch permaculture_twin twin.launch.py [mode:=fast|realtime] [gui:=true]

Webots is started directly on the generated world (not through WebotsLauncher,
which copies the world to /tmp where the IR posts' controller is not found).
"""
import json
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import (AppendEnvironmentVariable, DeclareLaunchArgument, EmitEvent, ExecuteProcess,
                            OpaqueFunction, RegisterEventHandler, SetEnvironmentVariable)
from launch.event_handlers import OnProcessExit
from launch.events import Shutdown
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from webots_ros2_driver.webots_controller import WebotsController


def default_twin_root():
    # with colcon --symlink-install this file links back to twin/ros2/permaculture_twin/launch/
    here = os.path.realpath(__file__)
    return os.environ.get("PERMA_TWIN_ROOT", os.path.abspath(os.path.join(os.path.dirname(here), "..", "..", "..")))


def setup(context):
    root = LaunchConfiguration("twin_root").perform(context)
    mode = LaunchConfiguration("mode").perform(context)
    gui = LaunchConfiguration("gui").perform(context).lower() == "true"
    world = os.path.join(root, "worlds", "site_ros.wbt")
    if not os.path.exists(world):
        raise RuntimeError(f"{world} is missing: run python3 tools/generate_world.py --ros first")
    with open(os.path.join(root, "site_config.json")) as fh:
        rovers = list(json.load(fh)["rovers"])
    share = get_package_share_directory("permaculture_twin")

    cmd = ["webots", f"--mode={mode}", "--batch"]
    if not gui:
        cmd += ["--no-rendering", "--stdout", "--stderr", "--minimize"]
    webots = ExecuteProcess(cmd=cmd + [world], output="screen", name="webots")

    actions = [
        SetEnvironmentVariable("PERMA_TWIN_ROOT", root),
        AppendEnvironmentVariable("PYTHONPATH", root),
        webots,
        WebotsController(robot_name="garden_supervisor",
                         parameters=[{"robot_description": os.path.join(share, "resource", "garden.urdf")}]),
        RegisterEventHandler(OnProcessExit(target_action=webots, on_exit=[EmitEvent(event=Shutdown())])),
    ]
    for r in rovers:
        actions.append(WebotsController(robot_name=r, namespace=r,
                                        parameters=[{"robot_description": os.path.join(share, "resource", "rover.urdf")}]))
        actions.append(Node(package="permaculture_twin", executable="explorer_node", name="explorer", namespace=r,
                            output="screen", parameters=[{"use_sim_time": True}]))
    return actions


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument("mode", default_value="fast", description="Webots mode: fast or realtime"),
        DeclareLaunchArgument("gui", default_value="false", description="true: open the Webots window"),
        DeclareLaunchArgument("twin_root", default_value=default_twin_root(),
                              description="twin project folder (worlds/, site_config.json, data/)"),
        OpaqueFunction(function=setup),
    ])
