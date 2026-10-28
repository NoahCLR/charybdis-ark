# Ark is layered, and the layering is enforced

Cited as D-L10.

`core/` is split into `data`, `transport`, `schema`, `protocol`, `model` and `session`, which import in one direction only, and `tests/` mirrors those layers. The webview never imports `core/`: it renders the model the core posts and shares only the type declarations in `contracts/` (D-L59), so the core runs in plain Node and the interface stays replaceable. `tests/layering.test.js` enforces the rules, type-only imports included, because the app this replaced was a single 14,539-line file that grew one convenience at a time. The layer table and where new work belongs are in [`AGENTS.md`](../architecture/README.md#the-layers).

Amended 2026-10-28 (D-L73): the shared rules in `rules/` sit outside the layers and import only each other. Core's layers from `schema/` up and the webview's `view/` may import them, so a rule both run has one implementation; the webview still imports nothing from `core/`.
