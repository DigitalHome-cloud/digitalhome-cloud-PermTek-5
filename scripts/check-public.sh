#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# This repository is public: refuse anything that locates a real site, anywhere in it (ADR 0006).
# The checks are the twin's (plans, generated worlds, run data, geographic keys, real elevations,
# terms from the private denylist ~/.config/permaculture/denylist), run over the whole tree.
exec "$(dirname "$0")/../twin/scripts/check-public.sh" "$(cd "$(dirname "$0")/.." && pwd)"
