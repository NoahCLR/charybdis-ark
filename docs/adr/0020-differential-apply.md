# Differential Apply

Cited as D-L20.

Apply sends one complete candidate profile, but transfers only the bytes that differ from the profile the keyboard is running, reusing ranges whose identity (kind, generation, origin half, CRC32 and FNV digest) the keyboard confirms, and falls back to a full upload when that source is missing or does not match. The keyboard still validates the whole candidate and publishes one new generation on both halves, so reuse saves transfer time without weakening what is checked; the identity is checked before the recovery copy is saved and again under the candidate lease. There is no second store, staging area or USB-half roll-forward (firmware D-F31). The rules are in [Reading, applying and progress](../architecture/profile-snapshot-and-progress.md#apply).
