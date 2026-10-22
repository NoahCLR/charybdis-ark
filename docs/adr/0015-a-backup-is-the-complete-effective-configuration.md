# A backup is the complete effective configuration

Cited as D-L15.

A backup has to reproduce a keyboard's configuration on its own, without leaning on whatever defaults the destination was compiled with, so export and import carry the whole effective configuration: every domain the keyboard runs, saved or compiled, materialized from device reads. Ark owns the JSON envelope, document version 5, which holds the complete canonical profile blob in base64 rather than separate fields; a complete file never falls back to the destination's compiled data, and older documents are refused without conversion (D-L54, D-L64). Before a file becomes the draft or is restored, Ark compares it with what the keyboard holds, since that is what applying it would write. The envelope rules are in [`core/README.md`](../../core/README.md) and the domain contracts in [portable-profile-v1.md](../../upstream/firmware/docs/architecture/portable-profile-v1.md).
