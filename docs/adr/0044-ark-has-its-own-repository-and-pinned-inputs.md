# Ark has its own repository and pinned firmware inputs

Cited as D-L44.

Ark owns its code, contributor instructions, tests, preview and catalog generation in a repository of its own, apart from the firmware it edits. The firmware fixtures, device specifications and QMK catalog inputs it relies on are reviewed snapshots under `upstream/` with revision and checksum provenance, so ordinary app commands read only this checkout, and only an explicit catalog import or refresh reads another. The snapshots describe the pinned firmware, not a second implementation of it, and changing one needs reviewed inputs and the firmware compatibility tests (D-L45). See [repository ownership](../REPOSITORY.md) and [upstream inputs](../../upstream/README.md).
