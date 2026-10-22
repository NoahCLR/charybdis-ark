# RGB rule identity and preview appearance are separate

Cited as D-L12.

Ark edits the stored lighting rules (colours, paint modes, LED groups) exactly as the keyboard keeps them, and draws the board as a separate preview computed from those rules: base lighting plus the selected layer, painted with the firmware's membership, pass-through and inheritance rules. The preview is not LED telemetry, since effects, animation phase, active layers and transient feedback are not reported; exact live appearance would need a device frame readout, not host reconstruction. Keeping the two apart means appearance never rewrites a stored value: brightness is absolute HSV that the reported ceiling limits only while editing, a colour at zero brightness keeps its other channels, and an explicit black stays distinct from the inheritance sentinel. `webview/view/lighting.mjs` owns those rules ([interface contracts](../spec/interface-contracts.md)).
