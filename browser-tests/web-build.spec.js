"use strict";
// The web build in Chrome: the bundled core/ must decode, encode and stage
// exactly as Node's core/ does, and the bundled panel must render the model it
// builds. playwright.config.js runs `npm run build:web` before these tests.
const fs = require("node:fs");
const path = require("node:path");
const {test, expect} = require("@playwright/test");
const {exerciseCore} = require("./core-exercise");

const ROOT = path.resolve(__dirname, "..");
const FIRMWARE_FIXTURES = path.join(ROOT, "upstream", "firmware", "tests", "fixtures");
const APP_FIXTURES = path.join(ROOT, "tests", "fixtures");
const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "web-manifest.json"), "utf8"));

// `key=value` fixture files, comments skipped.
function values(file) {
    return new Map(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}
const json = (name) => JSON.parse(fs.readFileSync(path.join(FIRMWARE_FIXTURES, name), "utf8"));

// Every profile and domain vector the repository has, read here in Node and
// handed to both runs as plain data.
async function inputs() {
    const blobs = [];
    for (const dir of [FIRMWARE_FIXTURES, APP_FIXTURES]) {
        for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".fixture")).sort()) {
            for (const [key, hex] of values(path.join(dir, file))) {
                if (/^(profile\.full|blob\.[a-z]+)\.hex$/.test(key)) blobs.push({name: `${dir === APP_FIXTURES ? "app" : "firmware"}/${file} ${key}`, hex, rejects: ["compiled_profile_v1.fixture", "compiled_profile_eight_v1.fixture"].includes(file) ? "INCOMPATIBLE_SCHEMA" : undefined});
            }
        }
    }
    const rgb = values(path.join(FIRMWARE_FIXTURES, "rgb_domain_v1.fixture"));
    const rgbOptions = {
        compiledStageMask: Number(rgb.get("codec.compiled_stage_mask")),
        logicalLayerCount: Number(rgb.get("codec.logical_layer_count")),
        maximumBrightness: Number(rgb.get("codec.maximum_brightness")),
        tapBranchColorCount: Number(rgb.get("codec.tap_branch_color_count")),
        supportedPdModeIds: Array.from({length: 32}, (_, id) => id).filter((id) => Number(rgb.get("codec.supported_pd_mode_mask")) & (1 << id)),
    };
    const behaviors = values(path.join(FIRMWARE_FIXTURES, "key_behavior_domain_v1.fixture"));
    const rgbV4 = json("rgb_domain_v4.json"), pdV3 = json("pd_mode_domain_v3.json");
    const domains = [
        {name: "rgb_domain_v1 payload", kind: "rgb", hex: rgb.get("payload.hex"), options: rgbOptions},
        ...[...rgbV4.valid, ...rgbV4.invalid].map((vector) => ({name: `rgb_domain_v4 ${vector.name}`, kind: "rgb", hex: vector.hex, options: {...rgbV4.limits, formatVersion: 4}})),
        ...[...behaviors].filter(([key]) => key.startsWith("payload.")).map(([key, hex]) => ({name: `key_behavior_domain_v1 ${key}`, kind: "behaviors", hex})),
        ...[...behaviors].filter(([key]) => key.startsWith("envelope.")).map(([key, hex]) => ({name: `key_behavior_domain_v1 ${key}`, kind: "behaviorEnvelope", hex})),
        {name: "combo_domain_v3", kind: "combos", hex: fs.readFileSync(path.join(FIRMWARE_FIXTURES, "combo_domain_v3.fixture"), "utf8").trim(), options: {version: 3}},
        {name: "pd_mode_domain_v1", kind: "pd", hex: json("pd_mode_domain_v1.json").hex, options: {version: 1}},
        ...[...pdV3.valid, ...pdV3.invalid].map((vector) => ({name: `pd_mode_domain_v3 ${vector.name}`, kind: "pd", hex: vector.hex, options: {version: 3}})),
    ];

    const {document: pdDocument} = require("../tests/fixtures/pd-profile");
    const {document32} = require("../tests/fixtures/pd-slots-32");
    const portableFixture = require("../tests/fixtures/portable-profile");
    const documents = [
        {name: "pd-profile", document: pdDocument()},
        {name: "pd-slots-32", document: document32()},
        {name: "portable-profile", document: portableFixture.document()},
        {name: "retired portable version", document: {...portableFixture.document(), version: 1}, rejects: "INVALID_PORTABLE_PROFILE"},
    ];
    for (const {name, document} of documents.filter(entry => !entry.rejects)) blobs.push({name: `document ${name}`, hex: Buffer.from(document.profile, "base64").toString("hex")});

    const edits = await import("../webview/view/edits.mjs");
    const {ACTION_ABI} = require("../core/schema/actions");
    const {PROFILE_WIRE_KNOWN_MASKS} = require("../core/protocol/profile-wire-v1");
    const draft = {
        document: pdDocument(),
        deviceId: "web-build-charybdis",
        capabilities: {compiledLayerCount: 16, supportedDomainMask: 31, actionAbiDigest: ACTION_ABI, featureFlags: PROFILE_WIRE_KNOWN_MASKS.FEATURE_FLAGS,
            responseVersion: 2, reportSize: 32, brightnessMax: 255, maxProfilePayload: 65504, maxBehaviorRows: 128, maxPopulatedBehaviorSteps: 640,
            maxCombos: 128, maxComboInputs: 16, maxTapStepsPerBehavior: 5, maxReusableRgbGroups: 16, maxRgbStageGroupRows: 32, viaMacroBytes: 10327},
        messages: [
            edits.setKey("Layer 1", 27, "KC_B"),
            {type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1400"}, {macro: "snipingDpi", value: "200"}]},
        ],
    };
    return {blobs, domains, documents, draft};
}

// Run in a page served beside the build, so its relative file names resolve.
async function openBuild(page, body = "") {
    const files = manifest();
    await page.route("**/dist/web/test.html", (route) => route.fulfill({contentType: "text/html", body: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ark web build</title>
<link rel="stylesheet" href="./${files.styles}">
</head><body>${body}</body></html>`}));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/dist/web/test.html");
    return {files, errors};
}

async function exerciseInChrome(page, files, given) {
    await page.evaluate(`window.exerciseCore = ${exerciseCore.toString()}`);
    return page.evaluate(async ({core, given}) => window.exerciseCore(await import(`./${core}`), given), {core: files.core, given});
}

test("the bundled core decodes, encodes and stages exactly as Node does", async ({page}) => {
    const given = await inputs();
    const node = exerciseCore(await import("../web/core.mjs"), given);
    // The comparison only means something if Node round-trips the fixtures:
    // every profile, and each of its domains, encodes to the bytes it came from.
    // The envelope vectors (blob.*) carry placeholder payloads, which only
    // have to fail alike.
    for (const [index, blob] of node.blobs.entries()) {
        const {name, hex, rejects} = given.blobs[index];
        if (rejects) {expect(blob.error, name).toBe(rejects); continue;}
        expect(blob.error, `${name}: ${blob.message}`).toBeUndefined();
        expect(blob.value.encoded, name).toEqual({buffer: hex});
        for (const [at, domain] of blob.value.domains.entries()) {
            if (!domain.encoded || /blob\.[a-z]+\.hex$/.test(name)) continue;
            expect(domain.encoded.error, `${name} domain ${domain.id}: ${domain.encoded.message}`).toBeUndefined();
            expect(domain.encoded.value, `${name} domain ${domain.id}`).toEqual(blob.value.decoded.domains[at].payload);
        }
    }
    // Each document is written again, field for field, from what it decoded to.
    for (const [index, entry] of node.documents.entries()) {
        const {name, document, rejects} = given.documents[index];
        if (rejects) {expect(entry.error, name).toBe(rejects); continue;}
        expect(entry.error, `${name}: ${entry.message}`).toBeUndefined();
        expect(entry.value.rewritten, name).toEqual(document);
    }
    expect(node.draft.staged.map((entry) => entry.error)).toEqual([undefined, undefined]);
    for (const [index, vector] of node.domains.entries()) {
        if (!vector.value.error) expect(vector.encoded.value, vector.name).toEqual({buffer: given.domains[index].hex});
    }
    expect(node.domains.filter((entry) => entry.value.error).length, "the invalid vectors are rejected").toBeGreaterThan(0);

    const {files, errors} = await openBuild(page);
    const chrome = await exerciseInChrome(page, files, given);
    expect(chrome.blobs).toEqual(node.blobs);
    expect(chrome.domains).toEqual(node.domains);
    expect(chrome.documents).toEqual(node.documents);
    expect(chrome.draft).toEqual(node.draft);
    expect(chrome.model).toEqual(node.model);
    expect(errors).toEqual([]);
});

test("the bundled panel renders the model the bundled core builds, and posts its edits", async ({page}) => {
    // Stand in for the host as scripts/preview.js does: answer "ready" with the
    // model and log every post.
    const {files, errors} = await openBuild(page, `<div id="root"></div>
<script>
window.__posted = [];
window.acquireVsCodeApi = () => ({
    postMessage: (message) => {
        window.__posted.push(message);
        if (message.type === "ready") window.dispatchEvent(new MessageEvent("message", {data: {type: "model", model: window.__model}}));
    },
    getState: () => undefined, setState: () => {},
});
</script>`);
    const chrome = await exerciseInChrome(page, files, await inputs());
    await page.evaluate((model) => {window.__model = model;}, chrome.rawModel);
    await page.addScriptTag({url: `./${files.panel}`, type: "module"});

    await page.locator('[data-screen="mouse"]').click();
    const field = page.locator('select[data-macro="normalDpi"]');
    await expect(field).toBeEnabled();
    await expect(field).toHaveValue("1400");
    await page.evaluate(() => {window.__posted.length = 0;});
    await field.selectOption("1200");
    await expect.poll(() => page.evaluate(() => window.__posted)).toEqual([
        expect.objectContaining({type: "updateConfigDefaults", sectionId: "normalPointerSpeed", fields: [{macro: "normalDpi", value: "1200"}, {macro: "snipingDpi", value: "200"}]}),
    ]);
    expect(errors).toEqual([]);
});
