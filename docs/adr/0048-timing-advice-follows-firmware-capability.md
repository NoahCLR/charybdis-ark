# Gesture timing advice follows firmware capability

Cited as D-L48.

Current firmware, the only firmware Ark supports (D-L64), times gestures from physical presses and decides every `LT()`, `MT()` and `OSM()` key itself, with or without a behaviour row (firmware D-F27). So Ark gives no advice about combo buffering or QMK's own tap classification, which only older firmware needed, and never suggests that anything but the keyboard decides a key's tap or hold. The firmware owns timing semantics (firmware D-F01); Ark consumes the capability, not firmware source, and recognising it is not hardware acceptance of a particular build. See [Timing, built-in branches and reachability](../architecture/timing-and-reachability.md).
