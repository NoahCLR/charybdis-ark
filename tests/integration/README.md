# Ark-owned firmware integration

These seven shell runners are invoked only by `npm run test:compat`, not by
ordinary app checks or firmware's suite. The bridge supplies absolute
`FIRMWARE_ROOT`, `CHARYBDIS_ARK_ROOT` and `QMK_ROOT` paths. Never guess sibling
paths. The selected Ark checkout owns these runners; firmware supplies the C
probes, sources, headers and golden fixtures. Temporary compiled output is
removed on exit. The runners must not write authored firmware fixtures during
normal integration checks.

The initial recipes were moved from firmware's five cross-language host
runners, preserving their normal/sanitized variants, PD mutations, seeded macro
corpus and profile round trips. Keep compilation recipes aligned with firmware
source wiring. A missing or incompatible source is a failure, not a skipped
check. Firmware's ordinary runners now use independent regression data instead.

RGB agreement runs the current format at both five- and eight-tap depth,
compiling firmware with the same depth as Ark's codec limits. Both normal and
sanitizer variants check fresh app encodings and mutated/truncated bytes.

The candidate-transfer runner owns its C transport probe here and links the
selected firmware's production candidate transaction, store backend and whole
validator. It compares full and differential uploads of ordinary and maximum
profiles and rejects corrupted reused bytes. The probe ends at validation;
firmware's separate host suites exercise committed-source reuse through the
production owner, both-half saving and reboot. Older firmware without this
optional extension reports this runner as skipped; test the proposed new firmware
too before handing over transfer changes. No device is opened.
