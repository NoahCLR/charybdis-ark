import test from "node:test";
import assert from "node:assert/strict";
import {SCREENS, configureReady, isScreenId, screenAvailable, screenDefinition, screenGroups, secondaryScreen} from "../../webview/view/screens.mjs";

test("the registry owns every rail screen and renderer in the existing order", () => {
    assert.deepEqual(screenGroups().map(({group, items}) => [group, items.map(({id}) => id)]), [
        ["Configure", ["keys", "lighting", "macros", "customKeys", "mouse", "pointing", "settings"]],
        ["Keyboard", ["profile", "device"]],
    ]);
    const renderers = Object.fromEntries(["Keys", "Lighting", "Macros", "CustomKeys", "Mouse", "Pointing", "Settings", "Profile", "Device"]
        .map(name => [`screen${name}`, () => name[0].toLowerCase() + name.slice(1)]));
    for (const [id, definition] of Object.entries(SCREENS)) {
        assert.equal(definition.render(renderers), id, `${id} selects its own screen`);
        assert.ok(definition.label && definition.title && definition.icon.startsWith("<svg"), id);
        assert.equal(isScreenId(id), true);
        assert.equal(screenDefinition(id), definition);
        assert.ok(Object.isFrozen(definition), id);
    }
});

test("every screen follows its readiness rule, including demo and read failures", () => {
    const noKeyboard = {load: {state: "unavailable"}, device: {connected: false}, portable: {available: false}};
    const connected = {...noKeyboard, device: {connected: true}};
    const backup = {...connected, portable: {available: true}};
    const ready = {...backup, load: {state: "ready"}};
    const demo = {...ready, device: {connected: false}, demo: {active: true}};
    assert.equal(configureReady(null), false);
    for (const [id, definition] of Object.entries(SCREENS)) {
        assert.equal(screenAvailable(null, id), false);
        assert.equal(screenAvailable(noKeyboard, id), false, id);
        assert.equal(screenAvailable({...ready, load: {state: "loading"}}, id), false, id);
        assert.equal(screenAvailable(connected, id), id === "device", id);
        assert.equal(screenAvailable(backup, id), definition.group === "Keyboard", id);
        assert.equal(screenAvailable(ready, id), true, id);
        assert.equal(screenAvailable(demo, id), true, id);
        assert.equal(definition.keepOnPublish, definition.group === "Configure", id);
        assert.equal(Boolean(definition.unavailable), definition.group === "Keyboard", id);
    }
});

test("an unknown screen cannot silently render Keys or pass readiness", () => {
    for (const id of ["missing", "toString", "__proto__", "", null, undefined, 0, {}]) {
        assert.equal(isScreenId(id), false);
        assert.equal(screenDefinition(id), null);
        assert.equal(screenAvailable({load: {state: "ready"}}, id), false);
    }
});

test("unavailable screens offer backups before device diagnostics and never link to themselves", () => {
    const connected = {load: {state: "unavailable"}, device: {connected: true}, portable: {available: true}};
    assert.deepEqual(secondaryScreen(connected, "keys"), {screen: "profile", label: "Backups"});
    assert.deepEqual(secondaryScreen(connected, "profile"), {screen: "device", label: "Keyboard"});
    assert.deepEqual(secondaryScreen({...connected, portable: {available: false}}, "keys"), {screen: "device", label: "Keyboard"});
    assert.equal(secondaryScreen({...connected, portable: {available: false}}, "device"), null);
    assert.equal(secondaryScreen({...connected, load: {state: "loading"}}, "keys"), null);
    assert.equal(secondaryScreen(null, "keys"), null);
});
