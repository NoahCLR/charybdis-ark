# Live: the keyboard saves by itself, Ark says so

Cited as D-L66.

Live is the third edit mode: edits reach the keyboard exactly as in Live + review (D-L65), but there is no Save, because the keyboard saves its working copy by itself after a quiet interval, with or without Ark (firmware D-F32). Ark only reports what the keyboard says: it looks at the edit status about once a second between edits and shows "saved by the keyboard", a failed save or the flags only from what it reads. A revision or mode Ark did not make is news, so the keyboard is read again, and an edit refused because the keyboard moved first is not sent; the person makes it again on what they can now see.

## Considered options

Ark asking for Save after its own timer: rejected, because the keyboard already saves with or without Ark, and two schedulers would race. Retrying a refused stale edit on the reread state: rejected, because replaying it on a state the person has not seen could undo the key's change.
