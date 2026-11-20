# The rail's messages close by themselves, failures stay

Cited as D-L106.

Every message Ark put beside the rail stayed until ✕ or the next message
replaced it: a read, a save, an export or a demo opened, said as any failure
was. In a window 1100px wide or less the message floats over the screen, so a
"Left the demo." sat over the work until it was dismissed.

The core now says what kind each message is (`noticeKind`: `failed`,
`lasting` or none, never two), and the rail keeps it by that:

- **A failure** (`failed`) stays until ✕, or until a later message replaces
  it, as the next action succeeding does. It is red and said assertively.
- **A message held while its condition is** (`lasting`) stays until the core
  takes it back or replaces it: no keyboard found, until one is listed; a
  restart, or a save waiting for the keyboard to take its new name, until the
  keyboard is back. A wait that ends saying nothing takes back what it said.
- **Any other message** closes by itself once there has been time to read it:
  five seconds, longer for a longer one at about 200 words a minute, and never
  more than ten (`readingTime`, `webview/view/rail-message.mjs`). A line along
  its foot drains from full to empty over that time, as a layer tab's line
  fills while a dragged key is held on it, so only a message that will close
  carries one. While the pointer is over it or focus is inside it, the time
  and the line both stop, and go on from where they were once it is left. ✕
  still closes it at once. With reduced motion the line is not drawn.
- **The keyboard's own error** (`device.health.error`) stays while the
  keyboard reports it. ✕ hides it until it says something else, and what was
  under it is shown and said; before, ✕ cleared the message under it and the
  error was drawn again at once.

The words no longer decide it. A message was a failure when it began with
"Failed" or the core marked it; several failures did not begin so and were
shown as plain messages: a profile, or parts of it, that could not be read, a
keyboard that did not come back or cannot be told, firmware too old to edit, a
keyboard that did not finish starting, a slave half that refused an edit, and
edits kept over a restart that could not be put back, with where their
recovery copy is. Every message is now said through `say`, `sayAfter` or
`takeBack` (`core/session/panel-session-state.js`), so none takes the kind of
the one before it, and the webview reads only the kind.

Two messages that sound like trouble stay ones that close by themselves, as
nothing failed: "Not sent: the keyboard changed by itself…", where the
keyboard moved first and the draft now shows it, to make the edit again; and
"the slave half is catching up", which the next edit waits out by itself.

Which message the rail shows, the failure, then the keyboard's error, then the
rest, is decided once (`railMessageView`): ✕ closes that one, and a screen
reader hears that one, once, when it is said. Closing a message redraws it
alone, never the screen being worked in.

## Considered options

Keeping everything until dismissed, but out of the way: the narrow window's
floating message has nowhere else to go, and a confirmation nobody needs to
act on still asks to be dismissed.

Closing failures too, after longer: a failure is often what the person has to
act on, and a message gone before they looked is worse than one more ✕.

Keeping a condition's failure under a later message, to come back when that
message closes: the core would then publish each condition with every model
rather than once, a larger change than the failures it would serve, which a
later message already follows the next action for.

Holding "the slave half is catching up" until the halves agree: what the
keyboard reports right after an edit can still say they agree, so the core
could take it back before it was read, and the next edit waits for the slave
half whether or not it is said.
