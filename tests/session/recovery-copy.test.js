"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {recoveryFileName} = require("../../core/session/recovery-copy");

const at = new Date("2026-10-23T14:02:00.512Z");

test("a recovery copy is named by when, what made it and the keyboard", () => {
    assert.equal(recoveryFileName({format: "charybdis-profile"}, {cause: "save", keyboard: "Noah's Charybdis"}, at),
        "recovery-2026-10-23T14-02-00-512Z-before-save-noah-s-charybdis.charybdis.json");
    assert.equal(recoveryFileName({format: "charybdis-recovery-capture"}, {cause: "restore", keyboard: "Bastard Keyboards Charybdis"}, at),
        "recovery-2026-10-23T14-02-00-512Z-before-restore-bastard-keyboards-charybdis.diagnostic.json");
});

test("every cause names a file, and a keyboard name is cut to letters and digits", () => {
    for (const cause of ["apply", "restore", "save", "restart", "leave-live"]) assert.match(recoveryFileName({format: "charybdis-profile"}, {cause, keyboard: ""}, at), new RegExp(`-before-${cause}\\.charybdis\\.json$`));
    assert.equal(recoveryFileName({format: "charybdis-profile"}, {cause: "apply", keyboard: "Clavier été ⌨️"}, at),
        "recovery-2026-10-23T14-02-00-512Z-before-apply-clavier-ete.charybdis.json");
    assert.match(recoveryFileName({format: "charybdis-profile"}, {cause: "apply", keyboard: "x".repeat(60)}, at), /-before-apply-x{40}\.charybdis\.json$/);
});
