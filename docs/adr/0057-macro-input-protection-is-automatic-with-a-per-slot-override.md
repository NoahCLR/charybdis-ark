# Macro input protection is automatic, with a per-slot override

Cited as D-L57.

Firmware can protect a macro's playback from this keyboard's other input (firmware D-F17), and Ark offers it per macro as Automatic, On or Off. Automatic turns on when the selected layout must enter some of the macro's text as Unicode, where an interleaved keypress would break the entry sequence, rather than whenever the text is non-ASCII; it therefore follows Host changes and Review groups that derived effect with Host, while an explicit On or Off is a macro edit. The choice is a prefix stored in the macro's own bytes (`core/schema/macro-payload.js`), so text and name edits, backups and imports carry it with the macro.
