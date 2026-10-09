# SPDX-License-Identifier: GPL-3.0-or-later
from glob import glob

from setuptools import setup

package_name = "permaculture_twin"

setup(
    name=package_name,
    version="0.1.0",
    packages=[package_name],
    data_files=[
        ("share/ament_index/resource_index/packages", ["resource/" + package_name]),
        ("share/" + package_name, ["package.xml"]),
        ("share/" + package_name + "/resource", glob("resource/*.urdf")),
        ("share/" + package_name + "/launch", glob("launch/*.py")),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    license="GPL-3.0-or-later",
    entry_points={"console_scripts": ["explorer_node = permaculture_twin.explorer_node:main"]},
)
