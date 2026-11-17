# The brightness limit holds an edit and a send, not the format

Cited as D-L98.

A keyboard reports the brightest colour it accepts, and its firmware refuses a
profile holding a lighting colour past it. A backup can hold one all the same:
edited by hand, or exported from a keyboard with a higher limit. Ark applied
the limit inside the lighting codec, so once such a colour was in the draft
every lighting edit failed, the one that would lower it included, and a
pointing mode swap with it. The only way out was to edit the backup and import
it again.

## The decision

- **Well-formedness is the codec's.** Ark reads and writes a lighting domain
  whatever brightness its colours hold: the codec checks bytes, LED sets,
  accents, sizes and stages, as before, and writes the same bytes for a valid
  profile.
- **The limit holds each colour an edit sets.** A colour an edit sets is
  refused past the limit, in place and with the reason. A colour sent back
  exactly as it is stored is kept, so an edit to something else on the same
  record goes through.
- **The limit blocks every way out of Ark.** Review's blocker names each
  colour past the limit, by stage, and stops Save; a direct restore is refused
  before anything is written; a live edit is not sent while the draft holds
  one. Nothing past the limit reaches a keyboard.

So a backup brighter than the keyboard is repaired in Lighting, where the
blocker opens its stage, and not by importing it again. That is in Review and
save, whose draft waits in Ark. A live draft is what the keyboard runs, so it
never holds such a colour: using the backup as the draft is refused there,
and the refusal names Review and save.

## Considered and rejected

- **Clamp on import.** It changes what the backup holds without the person
  choosing it.
- **Keep the limit in the codec and exempt only lowering edits.** Every other
  lighting edit, and a pointing mode swap, would still fail with the codec's
  own text while one colour remained.

Held by: `tests/model/device-profile-edits.test.js`,
`tests/session/profile-draft-session.test.js`,
`tests/session/live-edits.test.js`, `tests/model/profile-checks.test.js`.
