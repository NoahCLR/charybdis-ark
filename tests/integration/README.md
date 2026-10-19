# Ark-owned firmware integration

These shell runners are invoked only by `npm run test:compat`, not by
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
production owner, both-half saving and reboot. No device is opened.

The macro-domain runner links the selected firmware's production incremental
macro validator. C-produced streams decode and re-encode in Ark; JS-produced
empty, sparse, dense and full-capacity domains, UTF-8, protection, keys, delays,
unused tails and malformed data receive matching C/JS judgements, with exact
transported bytes and source offsets beyond 64 KiB. Both variants run under
the bridge, with no VIA code or hardware.

The schema-4 candidate corpus uses all seven domains. The maximum frozen
profile is 74,801 bytes, so full and differential uploads exercise offsets
past 64 KiB through the production C validator and store, in both normal and
sanitizer builds. The probe’s byte media models the dedicated profile region,
independent of QMK’s eeconfig EEPROM. Production matrix dimensions set the keymap
validator’s placement count. The compiled-defaults runner also validates
Ark-generated seven-domain candidates, including populated macro streams.
