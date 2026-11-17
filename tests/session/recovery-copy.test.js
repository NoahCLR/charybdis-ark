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

test("a recovery copy the browser's storage will not keep says why and what helps, with a code of its own", async () => {
    const {recoveryStorageFailure, RECOVERY_STORAGE_WORDS} = require("../../core/session/recovery-copy");
    const {failureSentence} = require("../../core/model/vocabulary");
    const refusal = (name) => recoveryStorageFailure(new DOMException("The browser's own words.", name));
    for (const [name, code, words] of [["QuotaExceededError", "RECOVERY_STORAGE_FULL", RECOVERY_STORAGE_WORDS.full],
        ["SecurityError", "RECOVERY_STORAGE_REFUSED", RECOVERY_STORAGE_WORDS.refused],
        ["UnknownError", "RECOVERY_STORAGE_UNAVAILABLE", RECOVERY_STORAGE_WORDS.unavailable],
        ["InvalidStateError", "RECOVERY_STORAGE_UNAVAILABLE", RECOVERY_STORAGE_WORDS.unavailable]]) {
        const error = refusal(name);
        assert.equal(error.code, code, name);
        assert.equal(failureSentence(error), words, `${name} is said as the storage's refusal, never as Ark's fault`);
        assert.equal(error.storageError.name, name, "the browser's error is kept beside it");
    }
    assert.match(RECOVERY_STORAGE_WORDS.full, /Backups/);
    assert.match(RECOVERY_STORAGE_WORDS.refused, /not to let this page save data/);
    // Ark's own fault, or a sentence it already wrote, is passed on as it is.
    const fault = new TypeError("x is undefined"), said = new Error("This browser cannot store recovery copies.");
    assert.equal(recoveryStorageFailure(fault), fault);
    assert.equal(recoveryStorageFailure(said), said);
});
