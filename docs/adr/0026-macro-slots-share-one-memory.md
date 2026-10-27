# Macro slots share one memory, and every slot says what fits

Cited as D-L26.

All 128 macro slots share the profile's free space, within the macro-domain limit the keyboard reports, and the keyboard plays a stored macro in bounded windows (firmware D-F14), so a macro is limited only by free memory rather than by a fixed per-slot size. Because the firmware does not reserve room for empty slots, Ark keeps room for ten key taps in each one and marks the highest-numbered empty slots unavailable when it cannot, so picking an empty slot never leads to a macro that cannot be written. A backup stores macro streams, not a bank size, so the same macros match across keyboards with different banks. The budget is computed in `core/model/macro-editor.js`, and the macro editor checks input with the same codec and limits as staging (`core/model/macro-input.js`).
