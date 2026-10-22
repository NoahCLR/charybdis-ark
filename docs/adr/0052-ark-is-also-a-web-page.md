# Ark is also a web page

Cited as D-L52.

So that using Ark needs no VS Code, no checkout and no install, it also runs as a web page in Chrome and Edge, with the same `core/` and interface as the extension (D-L02): the page's shell (`web/`) does over WebHID what `extension.js` does in VS Code, and what differs reaches the interface only as `model.host`, so the interface never asks which shell it is in. The page is static files with no server code, makes no network request once loaded, reaches a keyboard only after the person picks it in the browser's picker, and keeps recovery copies in the browser's storage. A phone, which has no WebHID and too small a screen, gets a notice instead of Ark. Cloudflare Pages publishes the built folder from `dev` and `main`, and its build gates only publication, never standing in for verification or release checks (D-L51); see [the web build](../REPOSITORY.md#the-web-build) and [publishing the web page](../REPOSITORY.md#publishing-the-web-page).
