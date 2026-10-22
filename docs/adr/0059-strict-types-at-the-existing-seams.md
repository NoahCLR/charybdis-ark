# Strict types at the existing seams, source still runs directly

Cited as D-L59.

Ark checks its JavaScript with strict TypeScript, emitting no files, so the extension and fixture interface keep running their source directly and there is no build step between an edit and a run. Each environment (core, extension, browser host, renderer, worker, developer scripts) has its own configuration that takes in new modules automatically, and `npm run typecheck` is part of the ordinary check. Posted panel data has one inert contract under `contracts/`, and type-only imports obey D-L10's layer rules, so the interface still imports no core module or core type. Types describe application contracts, not valid bytes: defensive decoding and the runtime validators keep their jobs. [Developing Ark](../development.md#type-checking) holds the configurations and the check.
