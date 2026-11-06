import assert from "node:assert/strict";
import test from "node:test";
import {GEO, LED_CORNER, LEGEND_MIN, boardOutlineMarkup, fitLegend, fitText, inLocality, isRightHalf, keyFaceRows, keyLegends, keyVisual, textWidth, trackballInLocality} from "../../webview/view/geometry.mjs";

test("the board splits into halves the way the LED numbering does", () => {
    assert.equal(isRightHalf(0), false, "left home column");
    assert.equal(isRightHalf(6), true, "first right column");
    assert.equal(isRightHalf(50), false, "left thumb cluster");
    assert.equal(isRightHalf(51), true, "right thumb cluster");
    assert.equal(isRightHalf(55), true);
});

test("locality answers for the regions the firmware defines", () => {
    assert.equal(inLocality(0, "RGB_BOTH_HALVES"), true);
    assert.equal(inLocality(0, "RGB_LEFT_HALF"), true);
    assert.equal(inLocality(6, "RGB_LEFT_HALF"), false);
    assert.equal(inLocality(6, "RGB_RIGHT_HALF"), true);
    assert.equal(inLocality(6, "RGB_KEY_HALF", 7), true, "same half as the trigger");
    assert.equal(inLocality(0, "RGB_KEY_HALF", 7), false);
    assert.equal(inLocality(7, "RGB_KEYS_ONLY", 7), true);
    assert.equal(inLocality(6, "RGB_KEYS_ONLY", 7), false);
    assert.equal(inLocality(6, "RGB_KEYS_ONLY", undefined), true, "with no trigger key, as a mode no key holds, every key paints");
    assert.equal(inLocality(0, "RGB_KEY_HALF", undefined), true, "and both halves do");
    assert.equal(trackballInLocality("RGB_KEYS_ONLY", undefined), true);
    assert.equal(trackballInLocality("RGB_KEYS_ONLY", 51), false, "with one, the trackball is no key");
    // A held combo's inputs are all its trigger keys.
    assert.equal(inLocality(9, "RGB_KEYS_ONLY", [7, 9]), true);
    assert.equal(inLocality(0, "RGB_KEY_HALF", [7, 9]), false, "both inputs on the right paint the right half");
    assert.equal(inLocality(0, "RGB_KEY_HALF", [1, 7]), true, "inputs spanning the halves paint both");
    assert.equal(trackballInLocality("RGB_KEY_HALF", [1, 2]), false, "the trackball sits on the right half");
    assert.equal(trackballInLocality("RGB_KEY_HALF", [1, 7]), true);
});

test("the trackball is drawn at its own size, clear of the keys around it", () => {
    const {x, y, r} = GEO.trackball;
    // A 34mm ball among 19.05mm key pitches is nearly two keys across.
    assert.ok(Math.abs(2 * r / ((66 + GEO.rowStep) / 2) - 34 / 19.05) < 0.1,
        "the ball keeps its real size against the key pitch");

    for (let index = 0; index < 56; index += 1) {
        const key = keyVisual(index);
        // Nearest point of the cap to the ball's centre, which is enough for
        // the unrotated caps and conservative for the angled thumbs.
        const nearestX = Math.max(key.x, Math.min(x, key.x + GEO.keyW));
        const nearestY = Math.max(key.y, Math.min(y, key.y + GEO.keyH));
        const gap = Math.hypot(x - nearestX, y - nearestY) - r;
        assert.ok(gap > 0, `key ${index} overlaps the ball by ${(-gap).toFixed(1)}`);
    }

    const [vx, vy, vw, vh] = GEO.viewBox.split(" ").map(Number);
    assert.ok(x - r >= vx && x + r <= vx + vw, "the ball is inside the board horizontally");
    assert.ok(y - r >= vy && y + r + 12 <= vy + vh, "and its caption still fits beneath it");
});

test("every position lands inside the drawn board", () => {
    const [vx, vy, vw, vh] = GEO.viewBox.split(" ").map(Number);
    for (let index = 0; index < 56; index += 1) {
        const {x, y} = keyVisual(index);
        assert.ok(x >= vx && x + GEO.keyW <= vx + vw, `key ${index} is inside horizontally`);
        assert.ok(y >= vy && y + GEO.keyH <= vy + vh, `key ${index} is inside vertically`);
    }
});

test("the trackball LED sits on the right half and is nobody's trigger key", () => {
    assert.equal(trackballInLocality("RGB_BOTH_HALVES"), true);
    assert.equal(trackballInLocality("RGB_RIGHT_HALF"), true);
    assert.equal(trackballInLocality("RGB_LEFT_HALF"), false);
    assert.equal(trackballInLocality("RGB_KEY_HALF", 7), true, "a right-half trigger reaches it");
    assert.equal(trackballInLocality("RGB_KEY_HALF", 0), false, "a left-half trigger does not");
    assert.equal(trackballInLocality("RGB_KEYS_ONLY", 7), false, "no key maps to the trackball LED");
});

test("the key face drops its legend by how many rows sit above it", () => {
    const plain = keyFaceRows(0);
    assert.equal(plain.mainY, GEO.keyH / 2, "with nothing above, the legend is simply centred");
    assert.equal(plain.tierY, undefined);

    assert.equal(keyFaceRows(0, {tiers: true}).mainY, 36, "one row above pushes it down");
    assert.equal(keyFaceRows(0, {tiers: true, combos: true}).mainY, 40.4, "two rows push it further");
    assert.deepEqual(
        [keyFaceRows(0, {tiers: true, combos: true}).tierY, keyFaceRows(0, {tiers: true, combos: true}).comboY],
        [6.3, 14.2], "and the two rows stack without overlapping");
    assert.equal(keyFaceRows(0, {combos: true}).comboY, 7.2, "a combo row alone sits where the dots would");

    // A hold legend takes the bottom of the cap, with the rule between them.
    const dual = keyFaceRows(0, {tiers: true, sub: true});
    assert.ok(dual.mainY < dual.separatorY && dual.separatorY < dual.subY, "tap, rule, hold, in that order");
    assert.ok(dual.subY < GEO.keyH, "and the hold legend stays on the cap");
});

test("a row of icons sits under the legend, above the line on a key with one, and the legend rises to make room", () => {
    for (const tiers of [false, true]) for (const combos of [false, true]) for (const sub of [false, true]) {
        const plain = keyFaceRows(0, {tiers, combos, sub});
        const rows = keyFaceRows(0, {tiers, combos, sub, icons: true});
        const what = JSON.stringify({tiers, combos, sub});
        assert.equal(plain.iconY, undefined, `${what}: no icons, no row for them`);
        assert.ok(rows.iconY !== undefined && rows.iconY + rows.iconSize < GEO.keyH, `${what}: the icons stay on the cap`);
        assert.deepEqual([rows.tierY, rows.comboY], [plain.tierY, plain.comboY], `${what}: the rows above stay where they were`);
        assert.ok(rows.mainY < plain.mainY && rows.mainY < rows.iconY, `${what}: the legend rises, and the icons sit under it`);
        if (sub) {
            assert.ok(rows.iconY + rows.iconSize < rows.separatorY && rows.separatorY < rows.subY, `${what}: tap, icons, rule, hold, in that order`);
            assert.deepEqual([rows.separatorY, rows.subY], [plain.separatorY, plain.subY], `${what}: the rule and the hold stay where they were`);
        }
    }
});

test("a legend is sized to its row rather than bucketed by length", () => {
    const row = {max: 12, min: 7, width: 48};
    assert.deepEqual(fitText("Esc", row), {size: 12, squeeze: 0}, "a short legend takes the full size");
    assert.deepEqual(fitText("Tab", row).size, 12, "and so does another of the same width");

    const long = fitText("Left Control", row);
    assert.ok(long.size < 12 && long.size >= 7, "a long one shrinks to fit instead of changing face");
    assert.equal(long.squeeze, 48, "and is compressed into the row it was given");

    // Wider glyphs shrink further than narrow ones of the same count, which a
    // rule counting characters cannot tell apart.
    assert.ok(fitText("MMMMMMMM", row).size < fitText("iiiiiiii", row).size);
    assert.equal(fitText("", row).size, 12, "an empty legend has nothing to fit");
    assert.equal(fitText("Left Control", {max: 12, min: 11, width: 48}).size, 11, "the floor holds");
});

test("a legend alone on its cap never shrinks past the legible floor: a long one takes two lines", () => {
    const row = {max: 12, width: GEO.keyW - 10};
    assert.deepEqual(fitLegend("Esc", row), {size: 12, lines: [{text: "Esc", squeeze: 0}]}, "a short legend is one line at full size");
    const shift = fitLegend("Left Shift", row);
    assert.equal(shift.lines.length, 1, "one that fits at the floor stays on one line");
    assert.ok(shift.size >= LEGEND_MIN && shift.size < 12);

    const slot = fitLegend("Slot 6 · hold (empty)", row);
    assert.deepEqual(slot.lines.map((line) => line.text), ["Slot 6", "hold (empty)"], "broken where the separator was, which the break replaces");
    assert.ok(slot.size >= LEGEND_MIN, "and drawn no smaller than the floor");
    assert.deepEqual(fitLegend("Custom key 0", row).lines.map((line) => line.text), ["Custom", "key 0"], "the longer line comes out shortest");
    for (const name of ["Slot 20 · lock (empty)", "Dragscroll · hold", "Left Command", "Custom key 127"]) {
        const fit = fitLegend(name, row);
        assert.ok(fit.size >= LEGEND_MIN, `${name}: at least the floor`);
        assert.equal(fit.lines.map((line) => line.text).join(" ").replace(/ /g, ""), name.replace(/ · /g, " ").replace(/ /g, ""), `${name}: every word kept`);
    }
    const word = fitLegend("Supercalifragilistic", row);
    assert.equal(word.lines.length, 1, "a single word has nowhere to break");
    assert.equal(word.size, LEGEND_MIN);
    assert.equal(word.lines[0].squeeze, row.width, "so it is compressed into the row at the floor");
});

test("the board outline draws every key and the trackball", () => {
    const markup = boardOutlineMarkup("mark");
    assert.match(markup, /^<svg class="mark" viewBox="20 96 1082 478"/);
    assert.equal(markup.match(/<rect /g)?.length, 56);
    assert.equal(markup.match(/<circle /g)?.length, 1);
    assert.equal(markup.match(/rotate\(/g)?.length, 7, "the angled thumb keys stay angled");
});

test("with the LED's number in the corner, no legend line reaches it: one that falls that low fits between the corners", () => {
    const names = ["Left Command", "Right Option", "Backspace", "A", "Slot 6 · hold (empty)", "Left Command Shift Option"];
    const y = 100;
    for (const tiers of [false, true]) for (const combos of [false, true]) for (const icons of [false, true]) for (const sub of ["", "Navigation"]) for (const main of names) {
        const rows = keyFaceRows(y, {tiers, combos, sub: Boolean(sub), icons});
        const above = Number(tiers) + Number(combos);
        const legend = keyLegends(y, rows, {main, sub, above, ledIndex: true});
        const drawn = [...legend.lines.map((line) => ({...line, size: legend.size})), ...(legend.sub ? [{...legend.sub, text: sub}] : [])];
        for (const line of drawn) {
            if (line.y + line.size / 2 <= y + LED_CORNER.top) continue;
            const width = line.squeeze || textWidth(line.text, line.size);
            assert.ok(width <= LED_CORNER.width + 0.01, `${main}${sub ? ` / ${sub}` : ""} (tiers ${tiers}, combos ${combos}, icons ${icons}): "${line.text}" runs ${width.toFixed(1)} wide in the corner's row`);
        }
    }
    // Left Command under a tier row and a combo row takes two lines, the
    // second down by the number.
    const rows = keyFaceRows(y, {tiers: true, combos: true});
    const crowded = keyLegends(y, rows, {main: "Left Command", above: 2, ledIndex: true});
    const plain = keyLegends(y, rows, {main: "Left Command", above: 2});
    assert.equal(crowded.lines.length, 2);
    assert.ok(crowded.lines.at(-1).y + crowded.size / 2 > y + LED_CORNER.top, "its last line reaches the corner's row");
    assert.ok(textWidth("Command", plain.size) > LED_CORNER.width, "set as wide as the cap, it would run into the number");
});
