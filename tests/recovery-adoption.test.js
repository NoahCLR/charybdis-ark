"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

// extension.js needs the host only when activated; this checks the copy rules.
const load = Module._load;
Module._load = function (request, ...rest) { return request === "vscode" ? {} : load.call(this, request, ...rest); };
const {adoptFormerRecoveries} = require("../extension");
Module._load = load;

test("recovery copies saved as Charybdis Live are copied once, never moved or overwritten", async () => {
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), "ark storage "));
    try {
        const write = (dir, name, text) => { fs.mkdirSync(path.join(storage, dir), {recursive: true}); fs.writeFileSync(path.join(storage, dir, name), text); };
        write("noah.charybdis-live", "recovery-a.charybdis.json", "live a");
        write("noah.charybdis-live", "notes.txt", "not a recovery");
        write("noah.charybdis-live-v2", "recovery-a.charybdis.json", "v2 a");
        write("noah.charybdis-live-v2", "recovery-b.diagnostic.json", "v2 b");
        write("noah.charybdis-ark", "recovery-c.charybdis.json", "ark c");
        const target = path.join(storage, "noah.charybdis-ark");
        await adoptFormerRecoveries(target);
        await adoptFormerRecoveries(target);
        const read = name => fs.readFileSync(path.join(target, name), "utf8");
        assert.deepEqual(fs.readdirSync(target).sort(), ["recovery-a.charybdis.json", "recovery-b.diagnostic.json", "recovery-c.charybdis.json"]);
        assert.equal(read("recovery-a.charybdis.json"), "live a");
        assert.equal(read("recovery-b.diagnostic.json"), "v2 b");
        assert.equal(read("recovery-c.charybdis.json"), "ark c");
        assert.ok(fs.existsSync(path.join(storage, "noah.charybdis-live", "recovery-a.charybdis.json")));
        await adoptFormerRecoveries(path.join(storage, "elsewhere", "noah.charybdis-ark"));
    } finally { fs.rmSync(storage, {recursive: true, force: true}); }
});
