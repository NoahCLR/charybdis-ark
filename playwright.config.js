"use strict";
const {defineConfig} = require("@playwright/test");
// The tests build the web page first, unless ARK_WEB_BUILT says dist/web/ is
// already the build to test: the publish workflow tests the very files it
// then publishes.
const buildWeb = process.env.ARK_WEB_BUILT ? "" : " && npm run build:web";
module.exports = defineConfig({
    testDir: "./browser-tests",
    use: {baseURL: "http://127.0.0.1:8974", trace: "retain-on-failure"},
    webServer: {
        command: `npm run preview${buildWeb} && node scripts/serve.js . --port 8974`,
        url: "http://127.0.0.1:8974/preview/index.html",
        reuseExistingServer: false,
    },
    projects: [{name: "chromium", use: {browserName: "chromium"}}],
});
