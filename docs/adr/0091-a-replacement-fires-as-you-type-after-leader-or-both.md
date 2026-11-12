# A replacement fires as you type, after Leader, or both

Cited as D-L91.

The firmware's leader (firmware D-F71) holds what is typed after its Leader
key and sends a replacement when what was typed is one of its inputs. How a
replacement fires is the replacement's own: **as you type** (as a word ends),
**after Leader**, or **both**, stored as its trigger in the autocorrect
domain's correction row. Its inputs are one list whichever, words as every
input is (D-L84), so switching how it fires never touches them; after the
Leader key an input is typed whole, `recieve*` sent by `recieve`. An input of
a replacement that fires after Leader is what people call a **leader
input**.

## How it came to this

Noah chose the first presentation from the grilling's options (2026-11-10): a
choice per input, a marked chip, the wait on Host, the key in the picker, a
check for a missing key, and Try it for the leader. The firmware then stored
an input typed after the Leader key as a match of its own, any characters
including spaces, and one text could be only one input: a replacement could
not fire on `adn` both as a word ends and after Leader, and Ark kept two lists
of inputs, then two rows of them. Trying it, Noah found the screen never said
what the Leader key was and that he could not switch a replacement between
leader, replacement and both cleanly (2026-11-11). He asked for one list of
inputs with a switch, and chose words-only inputs over keeping spaces for
leader-only replacements, so the switch is always clean; the firmware moved
the choice onto the replacement (D-F71 amended).

## How it is shown

A replacement's editor has **Fires** above its inputs: **As you type**, **After
Leader** or **Both** (vocabulary `inputModes`), posted as
`updateAutocorrectTrigger` the moment it is chosen. A new replacement has the
same switch, and its first input's add carries it (`trigger`). While a
replacement fires after Leader, a line under the switch says what the Leader
key does, where it is placed (keys by layer, behaviours, combos, as Pointer
says where its sniping keys are) and **Place on a key →**, as a macro's and
a pointing mode's editors have it (Noah, 2026-11-12). Every replacement's line in the bank is tagged
with how it fires, in the switch's words, After Leader and Both in full text
colour and As you type quiet: a single mark for Leader could not tell After
Leader from Both (Noah, 2026-11-12). Review says a switch in its own words ("Fires: As you type
→ After Leader"), and says how an added or removed replacement fires only
when it fires after Leader.

## The key, the wait and the checks

The Leader key is QMK's `QK_LEADER`; the firmware runs it as an action of its
own wherever a switch key goes, and taps it as a switch key taps (Ark's
`isLeaderKey`, beside `isSwitchKey`). It leaves the picker's unbuilt keys and
sits in **Other QMK** in a group of its own, **Text replacement**, right after
**Switch keys**: it is text replacement's key, and it switches nothing.

**Leader waits**, settings scalar 32 (1000 to 10000 ms), is on Host's Text
replacement section under **Enabled**, in milliseconds like the keyboard's
other times, and its line says
the leader works with the switch off or turned off by key. Two profile checks
say what the keyboard accepts and cannot use: replacements that fire after a
Leader key no key, behaviour or combo sends (`leaderWithoutKey`), and a
Leader key with nothing on the list that fires after it
(`leaderWithoutInputs`), each placed where it can be fixed.

## Try it

Try it's box is never written into (D-L86), and no key types a Leader there.
While a replacement fires after Leader, a field of its own, **After Leader**,
tries what is typed after the key: core answers, with the box's own request,
whether the leader would send a replacement and which, wait for more (and
what Enter or the wait would send), or drop what was typed (`leaderOutcome`,
`AutocorrectLeaderTry`). The matcher runs the leader in a screen too, U+0010
standing for the key as the firmware's behaviour fixture writes it
(`leadStep`, which Try it's field and a screen share), and is held to the
fixture's leader cases that have one; the wait, Escape and a switch key are
the keyboard's, and those cases are skipped with their reasons.

## Files

D-L85's files carry how a replacement fires as `fires`, left out for one that
fires as you type: JSON as `"fires": "after leader"` or `"both"`, CSV in a
`fires` column ("as you type", "after leader", "both"). QMK's text format has
no Leader key: export leaves out a replacement that fires after Leader alone
and says how many in its first lines, as it does for macros, and writes one
that fires both ways as it fires as you type, saying how many there too;
`leader` or `both` straight before the arrow is an input itself. Import reads the firmware's own
authored lines, `leader pn -> text` and `both :adn: -> and`.

## Replacement feedback

What the leader sends flashes as the replacement it is, in the text or macro
colour (firmware D-F71: the leader shares text replacement's confirmation).
The Replacement feedback tab says so in its notes: for a send the trigger key
is the key that ended leading, and the wait names none (amended by D-L92:
what the wait sends flashes on the Leader key, and Leader waiting is a case
of its own on the tab). The leader works with
Text replacement off, so while the switch is off and a replacement fires
after Leader the tab does not read off (`stageIdle`, `listLeads`), and the
switch's banner there and on the Text replacement screen says that words are
left as typed while the Leader key still sends (vocabulary
`settingOff.leading`).
