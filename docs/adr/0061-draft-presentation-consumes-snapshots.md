# Draft presentation uses snapshots, device health uses reads

Cited as D-L61.

With a draft open, the editable model is built directly from its complete snapshot and that snapshot's decoded form (`buildSnapshotModel` in `core/session/device-model.js`), with editability from D-L60's binding, while the keyboard header and diagnostics always show the actual device state. A draft never fabricates device reads to pass through the read-only path (`buildDeviceModel`), so the panel cannot show a keyboard as healthy or read because a draft exists. Building the panel model is a pure projection that opens, closes and stales nothing; the panel loop observes service changes explicitly, and a standalone export reads the keyboard without replacing the editor's snapshot, so an export cannot move the draft's comparison base behind the user's edits.
