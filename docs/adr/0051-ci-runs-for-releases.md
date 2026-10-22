# CI runs for releases; agreement judges the other release

Cited as D-L51.

Local verification owns development checks, so GitHub Actions runs on promotions to `main` and nightly, not on task pull requests into `dev`. A promotion's agreement check judges the firmware this Ark will be released next to, firmware `main` or the prepared partner of a joint release, and publication rechecks it; nightly runs report development drift and published incompatibility without blocking anything. This keeps the development loop local while protecting the two published products against contract drift. Cloudflare's page builds are separate from these jobs and gate only publication (D-L52); jobs, partner selection and branch protections are in [CI and publishing](../REPOSITORY.md#ci-and-publishing).
