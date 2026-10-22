# Ark supports only current firmware

Cited as D-L64.

Firmware and Ark are one stack (D-L50): each Ark release is built against a firmware release, so Ark reads, edits, applies and restores only what that release stores and reports, and converts nothing. The exact Profile Wire and schema versions, major and minor, stand for everything the base does (firmware D-F28); `core/session/firmware-support.js` gates on them, and past those gates no code asks whether a feature is there. A keyboard that fails them, or stores another schema or domain version, is read no further than its identity and told to update both halves; a backup in another format is refused. The next firmware reaches Ark as one change to its version constants, codecs and tests, pinned and released with it (D-L44), and the agreement check fails a firmware whose versions are not exactly Ark's.

## Considered options

Keeping older keyboards readable and translating older backups, with per-feature fallbacks for what each firmware lacked: rejected, because an older keyboard is updated rather than accommodated, and every fallback was code that only old firmware exercised.
