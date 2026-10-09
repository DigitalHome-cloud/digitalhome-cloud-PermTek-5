#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the stigmergy rule on a running ROS 2 twin: rovers do not talk to each other.

    python3 tools/check_isolation.py rover1 rover2        # while the twin runs

Every node in a rover's namespace may publish, subscribe, serve or call only
names under that namespace, plus the few global ones every ROS node has.
Rovers meet only in the store (synced at the nest) and on the IR posts.
Exit code 1 lists every name that breaks the rule.
"""
import sys
import time

import rclpy

ALLOWED_GLOBAL = {"/clock", "/rosout", "/parameter_events",
                  "/remove_urdf_robot"}      # webots_ros2_driver listens for its own removal


def check(node, rovers, settle_s=3.0):
    time.sleep(settle_s)                     # let discovery see the whole graph
    problems, seen = [], 0
    for name, ns in node.get_node_names_and_namespaces():
        rover = ns.strip("/").split("/")[0]
        if rover not in rovers:
            continue                         # the garden and tools are not rovers
        seen += 1
        names = []
        for get in (node.get_publisher_names_and_types_by_node, node.get_subscriber_names_and_types_by_node,
                    node.get_service_names_and_types_by_node, node.get_client_names_and_types_by_node):
            names += [n for n, _ in get(name, ns)]
        for n in sorted(set(names)):
            if n.startswith(f"/{rover}/") or n in ALLOWED_GLOBAL:
                continue
            problems.append(f"{ns}/{name}: {n}")
    return seen, problems


def main():
    rovers = sys.argv[1:] or ["rover1", "rover2"]
    rclpy.init()
    node = rclpy.create_node("isolation_check")
    try:
        seen, problems = check(node, set(rovers))
    finally:
        node.destroy_node()
        rclpy.shutdown()
    if seen == 0:
        print("check_isolation: no rover nodes found (is the twin running?)", file=sys.stderr)
        sys.exit(2)
    for p in problems:
        print(f"check_isolation: outside its namespace: {p}", file=sys.stderr)
    if problems:
        sys.exit(1)
    print(f"check_isolation: ok ({seen} rover nodes, each only in its own namespace)")


if __name__ == "__main__":
    main()
