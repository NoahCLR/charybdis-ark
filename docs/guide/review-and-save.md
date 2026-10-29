# Review and save

Every edit you make goes into one draft, whatever screen you make it on. The
draft has undo, redo and a full history. How it reaches the keyboard, and when
it becomes permanent, depends on the edit mode.

## Edit modes

Pick the mode under **Edits** in the keyboard menu: click the keyboard's name
at the top of the rail. The keyboard stores it, so the choice holds across
replugs and in every browser. If the halves stored different modes, a dot
beside the mode says so and **Settle** in the menu stores this one on both.

| Mode | An edit… | It is kept when… | Unplugging before then… |
| --- | --- | --- | --- |
| **Live edit** | runs on the keyboard at once | the keyboard saves it by itself, a few seconds (3 unless it says otherwise) after your last edit with no key held | loses every edit since the last save |
| **Live preview + save** | runs on the keyboard at once | you review it and **Save** | puts back what was saved |
| **Review and save** | waits in Ark; the keyboard is unchanged | you review it and **Save** | changes nothing on the keyboard |

A keyboard that was never set is in Live preview + save.

Closing Ark changes none of this. In Live preview + save the keyboard keeps
running your unsaved edits until it is unplugged. In Live edit it saves them
by itself, with or without Ark.

### Live edit

Live edit works like Live preview + save (below), with the same undo, redo and
trap question, but there is no Save. The keyboard saves what it runs by itself
once you have stopped editing for the interval it reports (3 seconds unless it
says otherwise; the bar names it) and no key is held. Holding a key puts the
save off.

- The bar says **Not saved yet** until then, with **Revert** and a button
  that opens Review.
- It says **Saving on the keyboard** while the keyboard saves.
- Once the keyboard reports it saved, the bar goes and the keyboard's dot in
  the rail says **Saved by the keyboard** on hover.

Ark only reports what the keyboard says; it keeps no timer of its own. If the
keyboard's save fails, the bar says **The keyboard could not save** and offers
**Save again** or **Revert**. Your edits still run, unsaved, so don't unplug
the keyboard until one of them works.

### Live preview + save

Every edit takes effect on both halves as you make it, so you can try it as
you type. The bar counts the **unsaved changes** the keyboard runs. The bar
has two buttons:

- **Review and save** opens Review, which compares what the keyboard has
  **Saved** with what is **Running now**. **Save to keyboard** keeps a
  recovery copy of what was saved, then makes the running profile the saved
  one on both halves.
- **Revert** puts back the saved profile and leaves it as it is. Undo sends
  the edits again.

Undo and redo send their change to the keyboard too. Undo every edit and the
keyboard is back on its saved profile.

If an edit would add a trap or a warning (see [Checks](#checks)), Ark holds it
and asks first: **Go back** sends nothing, **Send anyway** sends it. An edit
that would add a blocker is not sent at all.

The keyboard takes an edit only at a moment nothing is held, so an edit made
while you hold a key (Shift, a held layer, a one-shot, a locked layer or
pointing mode) waits for you to let go. The bar says **Let go of the held keys
to finish the edit**, and what is held when the keyboard says. Ark waits as
long as it takes; the edit lands when you let go, as one step of the history
like any other. **Cancel edit** cancels it instead, and the keyboard keeps
running what it ran. Other edits wait until it is done. A **Revert** waits for
your keys in the same way, without Cancel edit.

Until the slave half has taken an edit, the bar says **the slave half is
catching up** and the next edit waits. If the slave half refuses the edits,
the bar says **the halves are apart**: the halves now run different profiles,
nothing can be saved, and **Revert** puts both back on the saved profile.

If the keyboard is unplugged or restarts during a save, Ark says **Ark can't
tell whether the save finished.**, then why. It keeps your edits as a recovery
copy on [Backups](backups.md), since a restart loses unsaved edits. Once it
reads the keyboard again it says what happened: the save finished; or it did
not and the keyboard still runs your edits, unsaved, so Save them again; or it
did not and the restart lost them, and the recovery copy has them.

### Review and save

Edits wait in Ark's draft and the keyboard runs its saved profile untouched.
The bar counts the changes in your draft and has two buttons:

- **Review and save** opens Review, where **Save to keyboard** saves them
  ([Saving](#saving)).
- **Discard all** throws the draft away. Undo brings it back.

The draft lives in the Ark tab. Closing it loses
edits you haven't saved.

### Switching modes

The keyboard changes mode only with nothing unsaved, so Ark asks when a switch
would lose something:

- From Live preview + save with unsaved changes, it asks you to **Save on
  keyboard** or **Revert** first.
- From Review and save to a live mode with a draft, it asks whether to
  **Send live** (your draft starts running on the keyboard, unsaved) or
  **Discard draft**.
- Leaving Live edit asks nothing. The keyboard saves what is left first, after
  a recovery copy.

**Cancel** changes nothing. Both halves store the mode, so switching needs the
cable between the halves. If the halves ever stored different modes,
**Settle** beside the switch stores the shown one on both.

## Review

Review lists every change in your draft, compared with the keyboard. Open it
from the bar.

**Checks** come first: what the draft lets the keyboard do, and what must be
fixed first. Then the changes, grouped by the area they are edited in:
Keys, Layers, Behaviours, Combos, Custom keys, Macros, Mouse (what Pointer
settings edits), Pointing modes, Lighting, Settings (the other Settings
screens) and so on. Each change shows the fields that differ, with
the keyboard's value and the draft's side by side.

- **Show** closes Review and opens the change where it is edited.
- **Discard** puts that one change back.
- Changes made by one edit, such as two keys swapped, are discarded together.

Layers are compared by which layer they are, not where they sit, so a
reorder is one change and a key edited afterwards is another.

## Checks

Before anything is kept, Review checks what the layers let you reach, through
keys, behaviours, combos, the trackball and pointing modes linked to layers.
Each check says whether your draft made it, the keyboard already has it, or
the draft fixes it.

- A **Trap** is a layer that can lock on with no way back to the base layer.
  Review shows the steps into it and a way out.
- A **Blocker** keeps Save disabled until it is fixed, such as a lighting
  effect or brightness this keyboard can't show.
- A **Warning** is something Ark asks about before saving: a layer nothing
  reaches, a layer key onto an empty layer, a combo that can't fire, a macro
  your computer's settings can't play, and so on.
- A **Notice** only informs, such as a behaviour that changes nothing.

When the draft has a trap or a warning, even one already on the keyboard,
Save asks first: **Go back** or **Save anyway**. Notices and fixed checks need
no answer.

When a new trap or warning clearly comes from one change, the check links to
it and the change is highlighted.

### Timing checks

The checks also read your timings. They warn about holds that overlap or can
never happen, and give advice on very short combo windows. The keyboard
decides every tap or hold itself, from the presses, so these checks only ever
rule out what can't happen. They don't promise every gesture is comfortable to
press.

## Draft history

**Draft history** at the foot of the rail lists every step of your draft,
newest first, each with when you made it and what it changed from the step
before. Go back or forward to any of them. In Review and save that changes
only the draft; in Live edit and Live preview + save the step goes to the
keyboard at once, as an edit.

⌘Z (Ctrl+Z) undoes and ⇧⌘Z or ⌘Y redoes, outside text fields and dialogs. The
macro editor has its own step undo while you work in it.

## When the keyboard changes under you

Keys on the keyboard that adjust a setting, such as DPI up or down and the
lighting keys, change what it runs. Ark notices within a second, reads the
keyboard again and shows the new value. That is not an error.

- In Review and save, a draft with edits then says **The keyboard changed**, and
  **Review against the keyboard** compares your draft with the keyboard as it
  is now. **Discard draft** starts over from the keyboard. Until you choose
  one, the editing screens say the keyboard changed since the draft began
  and point to the bar.
- In the live modes, the draft shows what the keyboard runs now, and its
  history starts again there. An edit you make just as a key changed the
  keyboard is not sent. Ark reads the keyboard; make the edit again.

**Keyboard adjustment pending** means such a change is still waiting to reach
both halves. Release any held keys. The keyboard's dot in the rail says it on
hover in every edit mode; it is the keyboard's own change, not an edit of
yours waiting to be saved.

## Saving

In Review and save, **Save to keyboard**, in Review, keeps a recovery copy,
then sends the whole profile to both halves as one save and reads it back.
The bar says **Saving to the keyboard** and shows each step:

1. Check the keyboard
2. Save a recovery copy
3. Send the profile
4. Keyboard checks the profile
5. Copy the profile to the slave half
6. Save it on the master half
7. Finish the slave half
8. Check both halves

The keyboard keeps running its saved profile until both halves confirm, then
both switch at once. Afterwards Ark reads the keyboard back, and editing
resumes when that read finishes. You can stay on any screen meanwhile.

A save is all or nothing. Release held keys and unlock layers first: the
keyboard waits for them, and if they stay held it gives up and nothing
changes.

If the save stops, the bar says **Save stopped at:** the step, and why, until
you dismiss it, with one of three outcomes:

- Nothing was saved: the keyboard kept the profile it had.
- The keyboard had already decided to save the new profile, and finishes it by
  itself once both halves are connected. Read the keyboard then.
- Ark can't tell which profile was saved. Read the keyboard to see what it
  runs now.

The message beside the rail starts with the same outcome, then says why in
plain words and what to do. When the keyboard rejected the profile, it names
the part as Review groups it, such as **in Behaviours, row 5**. If the
keyboard was unplugged or restarted, that is the reason given: **The keyboard
was disconnected or restarted.** Ark says **Keep both halves connected** only
while the keyboard is still connected.
Either way the recovery copy is on the [Backups](backups.md) screen. The
keyboard's own error, for whoever looks into it, is under **Diagnostics** on the
Keyboard screen.

## When the keyboard stops saving

Rarely, a keyboard stops saving: a flash write failed, or something else it
can't safely carry on from. Typing still works, but it refuses edits, Save
and Revert until it restarts. The bar says **The keyboard stopped saving**, in
every edit mode; in Review and save it still counts the changes in your draft.

**Restart**, in the bar, restarts both halves without unplugging:

1. With unsaved edits, Ark first keeps them as a recovery copy. If it can't,
   it doesn't restart.
2. The keyboard restarts and comes back a moment later. Ark waits for it to
   finish starting, then reads it again.
3. Ark sends your unsaved edits back, still unsaved. In Live preview + save,
   review and save them; in Live edit the keyboard saves them by itself.

In Review and save your draft lives in Ark, not on the keyboard, so a restart
loses nothing: the draft and its history stay as they are, ready to review and
save once the keyboard is back. Save waits for that: until the restart, it
says the keyboard stopped saving.

Unplugging the keyboard works too, but loses the unsaved edits. Ark never
restarts the keyboard on its own. If the keyboard stops saving again straight
away, the fault is in its flash or firmware and another restart won't help.

### When the keyboard needs a restart

If a save was cancelled and the slave half never confirmed it, the keyboard
refuses new saves until it restarts. Nothing was lost. The bar says **Restart
the keyboard**, in every edit mode, with the same **Restart** as above; the
keyboard's dot in the rail turns red and says it on hover too. If the keyboard
has also stopped saving, the bar says only that. Unplugging the master half's
USB cable works too, but loses unsaved edits.
