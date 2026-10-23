# Domain docs

How the engineering skills read this repository's domain documentation.

## Layout

Single-context: one `GLOSSARY.md` and one `docs/adr/` at the repository root.

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0002-ark-runs-in-vs-code-and-a-web-page.md
│   └── 0067-a-stopped-keyboard-says-so-and-ark-restarts-it.md
└── upstream/firmware/
    ├── GLOSSARY.md      the firmware's words, pinned
    └── docs/spec/       the firmware's specs, pinned
```

## Before exploring, read these

- **`GLOSSARY.md`** at the root, for the app's words.
- **`upstream/firmware/GLOSSARY.md`**, for the keyboard's words: halves,
  profiles, generations, the wire. It is a pinned copy of the firmware's
  glossary; change it in the firmware repository and re-pin
  ([`upstream/README.md`](../../upstream/README.md)).
- **`docs/adr/`**: the ADRs that touch the area you are about to work in.

If one of them does not exist yet, proceed silently; `domain-modeling` creates
them when a term or decision is resolved.

## Citing decisions

- **D-L<n>** is an Ark decision: `docs/adr/00<n>-*.md` here (D-L09 is
  `docs/adr/0009-*.md`). Code and docs cite them as D-L<n>. Missing numbers
  were retired or belong to the firmware.
- **D-F<n>** is a firmware decision, in the firmware repository's `docs/adr/`.
  Write it as "firmware D-F<n>"; change it there, as firmware work. Ark does
  not import them; the specs under `upstream/firmware/docs/spec/` link each
  one at the pinned commit.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal,
a hypothesis, a test name), use the term as `GLOSSARY.md` defines it. Do not
drift to synonyms it avoids. A concept missing from it is either language the
project does not use (reconsider) or a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, say so explicitly rather than
overriding it silently:

> _Contradicts D-L37 (any layer can be the base), but worth reopening because…_
