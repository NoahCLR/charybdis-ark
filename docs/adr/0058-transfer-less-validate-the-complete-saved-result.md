# Transfer less, validate the complete saved result

Cited as D-L58.

Apply sends only what changed: it plans the candidate against the exact active bytes the snapshot retained, aligning domains by identity so resizing one keeps later ones reusable, and firmware copies unchanged ranges while the host streams short or changed ones (firmware D-F18; `core/protocol/candidate-transfer-plan.js`, `core/session/candidate-upload-coordinator.js`). Reuse is a transport choice, not a trust shortcut: firmware still validates the complete reconstructed profile, a missing or mismatched source falls back to a full upload, and recovery copies, stale-base checks, both-half publication and a fresh post-Apply readback stay required. App-authored bytes never seed the verified-read cache; a proven Apply result is kept only as the next upload's reuse source. The rules are in [profile-capture-and-progress.md](../architecture/profile-capture-and-progress.md).
