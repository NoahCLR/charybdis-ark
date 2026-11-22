# Switch keys have a picker section of their own, and More keys is in Other QMK

Cited as D-L109. Amends D-L91: the Leader key sits in Switch keys' **Text
replacement** group, after that feature's switch keys.

The switch keys turn a feature on and off from a key: QMK's for combos and
for text replacement (autocorrect, in the keyboard's names), and the
keyboard's for behaviours and auto-mouse (firmware D-F66). They were one
group, **Switch keys**, deep in **Other QMK**, under the Magic keys, the
firmware keys and Space Cadet, though they switch the features Ark's own
screens set up.

They are now a picker section, **Switch keys**, where **More keys** was,
after Media and before Lighting. It has a group for each feature they
switch: **Combos**, **Text replacement**, **Behaviours** and **Auto-mouse**,
each with its On, Off and Toggle keys in that order. Text replacement's
Leader key comes after its three switch keys: it is that feature's key,
though it switches nothing.

**More keys**, the keyboard keys no other section takes (editing,
international and language keys, the rarer system keys and the rarely used
ones), moves into **Other QMK**, first, in its groups. Its system keys and
QMK's system keys (power, sleep and wake) are one **System** group, and
what no group takes is **Rarely used**, last.

Only the picker changes: core still publishes the switch keys in one group
(`Switch keys`, `core/model/profile-model.js`) and the Leader key in its own
(`Text replacement`); the section's groups tell them apart by keycode name
(`webview/view/picker-sections.mjs`).

## Considered options

**Keeping Leader in a group of its own after the switch keys**, as D-L91
had it: in a section of switch keys a group named for text replacement
beside its switch keys would split one feature's keys in two.

**Keeping one Switch keys group in the new section**: the group would repeat
the section's name, and twelve keys read faster under the feature they
switch.
