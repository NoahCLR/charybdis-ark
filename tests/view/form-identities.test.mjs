// @ts-check
import {test} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join} from "node:path";

test("every authored form control supplies a focus identity", () => {
    const root = fileURLToPath(new URL("../../webview/", import.meta.url));
    const violations = [];
    function visit(directory) {
        for (const entry of readdirSync(directory, {withFileTypes: true})) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (entry.name.endsWith(".mjs")) {
                const source = readFileSync(path, "utf8");
                for (const match of source.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
                    if (!/\bdata-f="[^"\n]+"/.test(match[0])) violations.push(`${path}:${source.slice(0, match.index).split("\n").length}`);
                }
            }
        }
    }
    visit(root);
    assert.deepEqual(violations, [], "form controls require explicit data-f; rendered uniqueness is checked in the browser");
});
