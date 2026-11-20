# The page is a web app with the board as its icon

Cited as D-L104.

The page can be saved as a web app, from Chrome or Edge (Install) and from Safari (Add to Home Screen, Add to Dock), and every icon it shows is the board: the 56 keys and the trackball where `webview/view/geometry.mjs` puts them, white on black and centred in a square, the drawing the phone notice and the panel's board make. `scripts/web-icon.js` draws it once, from that geometry, into the tab's favicon (SVG) and the PNGs a saved app shows: 180 px for Safari's `apple-touch-icon`, 192 and 512 px for the web app manifest, and a 512 px maskable one with a margin wide enough that Android's launcher, which crops to the middle 80 per cent, keeps the whole board. The build writes them and the manifest as content-hashed files beside the bundles (`scripts/build-web.js`), so `_headers` caches them like any other hashed file, and the page links them. The manifest names the app Charybdis Ark (Ark on a home screen), opens the page's own address in a window of its own, and adds nothing else: no service worker, so a saved app loads the newest Ark each time as the page does (D-L71), and shares the page's origin, keyboard permission and recovery copies.

The page's Content Security Policy gains `img-src 'self'` and `manifest-src 'self'`, so a browser that holds the favicon and manifest to it can load them; it still makes no connection (`connect-src 'none'`). The PNGs are drawn without a package (`iconPng`: each pixel is the share of a 4×4 grid of points inside a shape, written as 8-bit greyscale), so the build needs nothing beyond what Cloudflare Pages already installs.

## Considered options

Committing hand-made icon files: rejected, because they would drift from the board the panel draws. Drawing the PNGs with a rasterizing package (resvg, sharp): rejected, since the icon is rounded squares and a circle, and a native package would be a new dependency of every build for that. A close crop or one half of the board, which read better at 16 px: Noah chose the whole board, which matches the page's own drawing, for every size.
