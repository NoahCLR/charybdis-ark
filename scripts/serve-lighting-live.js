// @ts-check
"use strict";
// Explicit developer fake-device bench. It serves the built real browser host
// over a fake navigator.hid; it has no native adapter or real-device route.
// npm run preview -- --vscode && npm run build:web
// node scripts/serve-lighting-live.js --port 8984
const fs = require("node:fs"), path = require("node:path");
const {serve} = require("./serve");
const {lightingLiveKeyboard} = require("../tests/fixtures/lighting-live-keyboard");
const {document} = require("../tests/fixtures/portable-profile");
const {CHARYBDIS_VENDOR_ID, CHARYBDIS_PRODUCT_ID, QMK_RAW_HID_USAGE_PAGE, QMK_RAW_HID_USAGE} = require("../core/transport/device-adapter");
/** @param {string} root */
function liveBench(root) {
    const keyboard = lightingLiveKeyboard(document());
    const base = path.join(root, "dist/web"), page = fs.readFileSync(path.join(base, "index.html"), "utf8");
    const fakeHidSource = fs.readFileSync(path.join(root, "browser-tests/fake-hid.js"), "utf8");
    const boot = `localStorage.setItem("charybdis-ark.theme", new URLSearchParams(location.search).get("theme") === "light" ? "light" : "dark");
    window.__benchKeyboard = async (reportId, bytes) => {
        if (reportId !== 0) throw Error('Fake bench requires report 0');
        const r = await fetch('/__lighting-live/report', {method: 'POST', body: JSON.stringify(bytes)});
        if (!r.ok) throw Error('Fake bench rejected a report');return r.json();
    };
    (() => {const module = {exports: {}};${fakeHidSource};module.exports.installFakeHid(${JSON.stringify({vendorId: CHARYBDIS_VENDOR_ID, productId: CHARYBDIS_PRODUCT_ID, usagePage: QMK_RAW_HID_USAGE_PAGE, usage: QMK_RAW_HID_USAGE, bridge: "__benchKeyboard"})});})();
    window.__posted = [];
    const keep = () => {
        const api = window.acquireVsCodeApi?.();if (!api || api.__bench) {if(!api)requestAnimationFrame(keep);return;}
        api.__bench = true;const send=api.postMessage.bind(api);api.postMessage=m=>{window.__posted.push(structuredClone(m));return send(m);};
    };requestAnimationFrame(keep);`;
    /** @param {import('node:http').IncomingMessage} request @param {import('node:http').ServerResponse} response */
    return async function handle(request, response) {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/__lighting-live/")) return false;
        try {
            if (url.pathname === "/__lighting-live/boot.js") {response.writeHead(200, {"content-type": "text/javascript"}).end(boot);return true;}
            if (url.pathname === "/__lighting-live/bench.html") {
                const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
                const host = fs.readFileSync(path.join(root, `preview/vscode-${theme}.html`), "utf8");
                const styles = [...host.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join("\n");
                // The fixture bench adds the installed host's stylesheet; the
                // real shipped page keeps its own original CSP and bootstrap.
                const html = page.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, "").replace(/(src|href)="\.\//g, '$1="/dist/web/').replace('<body>', `<body class="vscode-body vscode-${theme}">`).replace('<link rel="stylesheet"', `${styles}<script src="/__lighting-live/boot.js"></script><link rel="stylesheet"`);
                response.writeHead(200, {"content-type": "text/html"}).end(html);return true;
            }
            if (url.pathname === "/__lighting-live/status") {
                response.writeHead(200, {"content-type": "application/json"}).end(JSON.stringify({reports: keyboard.liveRequests.slice(-512).map(r => [...r]), mutations: keyboard.mutations.length, displayed: keyboard.displayed ? [...keyboard.displayed] : null}));return true;
            }
            if (request.method !== "POST") throw Error("POST required");
            let text = "";for await (const bytes of request) {text += bytes;if (text.length > 1024) throw Error("bounded body required");}
            const data = JSON.parse(text);
            if (url.pathname === "/__lighting-live/report") {
                if (!Array.isArray(data) || data.length !== 32 || data.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw Error("32 byte report required");
                const replies = keyboard.answer(Buffer.from(data));
                for (const log of [keyboard.requests, keyboard.liveRequests, keyboard.mutations, keyboard.unhandled]) if (log.length > 512) log.splice(0, log.length - 512);
                response.writeHead(200, {"content-type": "application/json"}).end(JSON.stringify(replies.map(r => [...r])));return true;
            }
            if (url.pathname === "/__lighting-live/fault") {
                if (data === "peer") keyboard.peerResult = 10;
                else if (data === "mixed") keyboard.badPage = 10;
                else if (data === "clear") {keyboard.peerResult = 0;keyboard.badPage = -1;}
                else throw Error("known fixture fault required");
                response.writeHead(200).end("ok");return true;
            }
            throw Error("unknown fixture endpoint");
        } catch (error) {response.writeHead(400).end(error instanceof Error ? error.message : String(error));return true;}
    };
}
if (require.main === module) {
    const root = path.resolve(__dirname, ".."), at = process.argv.indexOf("--port"), port = at < 0 ? 8984 : Number(process.argv[at + 1]);
    serve(root, port, {handle: liveBench(root)}).then(() => console.log(`Fake keyboard only: http://127.0.0.1:${port}/__lighting-live/bench.html?theme=dark`));
}
module.exports = {liveBench};
