// @ts-check
import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join} from "node:path";

// A key or action is named with the layer it acts on marked, through
// actionMarked, keyNameMarked or the combo helpers in ui/marks.mjs
// (docs/architecture/interface-contracts.md). These are the ways a screen
// could name one as plain text instead.
const PLAIN = [
    // Escaping anything that holds a key's name, unless the name is already
    // inside the helper that marks it.
    [/esc\((?:(?!keyNameMarked\(|actionMarked\()[^;])*\b(?:actionLabel|cellLabel|keyName|comboInputLabel)\(/, "escapes a key's name instead of marking it"],
    [/esc\([^()]*\b(?:outputDisplay|inputDisplays|run\.shown)\b/, "escapes a combo's name instead of marking it"],
    [/\(\s*[\w.]+\.inputDisplays\s*\|\|/, "joins a combo's keys as plain text"],
];
// Where words alone are right, and why.
const PLAIN_ON_PURPOSE = [
    ["macros/steps.mjs", "describeStep(", "a macro step names only the basic keys a macro sends, which act on no layer"],
];

test("the checks catch the plain names they are for", () => {
    for (const snippet of ["${esc(actionLabel(model, row.keycode))}", "${esc(keyName(position))}", "${esc(cellLabel(model, tap))}",
        "${esc(position ? keyName(position) : \"—\")}", "${esc([picker.contextKeycode ? actionLabel(model, picker.contextKeycode) : \"\", picker.context].join(\" · \"))}",
        "${esc(combo.outputDisplay || combo.output)}", "${esc(run.shown)}", "${(combo.inputDisplays || combo.inputs || []).join(\" + \")}"]) {
        assert.ok(PLAIN.some(([pattern]) => pattern.test(snippet)), snippet);
    }
    for (const marked of ["${actionMarked(model, row.keycode)}", "${esc(note)} ${keyNameMarked(model, keyName(position), keyMeaning(position))}"]) {
        assert.ok(!PLAIN.some(([pattern]) => pattern.test(marked)), marked);
    }
});

test("no screen names a key or action as plain text", () => {
    const root = fileURLToPath(new URL("../../webview/ui/", import.meta.url));
    const violations = [];
    /** @param {string} directory */
    function visit(directory) {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith(".mjs") && entry.name !== "marks.mjs") {
                readFileSync(path, "utf8").split("\n").forEach((line, at) => {
                    if (PLAIN_ON_PURPOSE.some(([file, text]) => path.endsWith(file) && line.includes(text))) return;
                    for (const [pattern, why] of PLAIN) if (pattern.test(line)) violations.push(`${path}:${at + 1} ${why}`);
                });
            }
        }
    }
    visit(root);
    assert.deepEqual(violations, [], "name it through actionMarked or keyNameMarked (ui/marks.mjs)");
});
