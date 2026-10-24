# Ark is a web page

Cited as D-L71.

Ark is one web page in Chrome or Edge; the VS Code extension and the Ark branch window that opened a worktree's Ark in VS Code are retired. This supersedes D-L02 and D-L52. Using Ark needs no editor, no checkout and no install, and one shell means one set of defaults, words and themes to build, test and document: the page's shell (`web/`) runs the shared panel loop over WebHID, and what the page offers reaches the interface as `model.shell`, whose defaults are the page's (`core/session/panel-session.js`). The page is static files with no server code, makes no network request once loaded, reaches a keyboard only after the person picks it in the browser's picker, and keeps recovery copies in the browser's storage. A phone, which has no WebHID and too small a screen, gets a notice instead of Ark. Cloudflare Pages publishes the built folder from `dev` and `main`, and its build gates only publication, never standing in for verification or release checks (D-L51). A branch is tried before it lands through its pull request's Cloudflare preview ("Try this PR"); see [the web build](../development.md#the-web-build) and [publishing the web page](../development.md#publishing-the-web-page).

`core/` still imports no shell and no DOM, and its device service has no default transport: the caller passes the adapter. The node-hid adapter stays, for development only: Node scripts and agents drive a keyboard through it (`npm run probe:live-link`, `npm run preview -- --device`), node-hid is a development dependency, and the web build refuses it.

## Considered options

Keeping the extension beside the page: rejected, because nobody used it once the page could do everything it did, and it kept a second set of words, themes, recovery storage and tests that every interface change had to satisfy. Dropping node-hid with it: rejected, because an agent working with the keyboard runs in Node, where there is no browser picker for a person to answer. The extension's recovery copies, kept in VS Code's storage in an older format Ark refuses, are not carried over.
