"use strict";
const {defineConfig} = require("@playwright/test");
module.exports = defineConfig({
    testDir: "./browser-tests",
    use: {baseURL: "http://127.0.0.1:8974", trace: "retain-on-failure"},
    webServer: {
        command: "npm run preview && python3 -m http.server 8974 --bind 127.0.0.1",
        url: "http://127.0.0.1:8974/preview/index.html",
        reuseExistingServer: false,
    },
    projects: [{name: "chromium", use: {browserName: "chromium"}}],
});
