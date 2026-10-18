import assert from "node:assert/strict";
import test from "node:test";
import {GEO, LED_INDEX, boardOutlineMarkup, TRACKBALL_LED, fitText, inLocality, isRightHalf, keyFaceRows, keyVisual, trackballInLocality} from "../../webview/view/geometry.mjs";

test("the board splits into halves the way the LED numbering does", () => {
    assert.equal(isRightHalf(0), false, "left home column");
    assert.equal(isRightHalf(6), true, "first right column");
    assert.equal(isRightHalf(50), false, "left thumb cluster");
    assert.equal(isRightHalf(51), true, "right thumb cluster");
    assert.equal(isRightHalf(55), true);
    assert.equal(LED_INDEX[0], 0);
    assert.equal(LED_INDEX[51], 53, "right thumb keys carry right-half LEDs");
    assert.equal(new Set(Object.values(LED_INDEX)).size, 56, "every position has its own LED");
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
    assert.equal(inLocality(6, "RGB_KEYS_ONLY", undefined), true, "with no trigger key the firmware paints every LED (rgb_pd_mode_stage.c)");
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
    assert.equal(TRACKBALL_LED, 56, "the index the firmware solders the trackball LED at");
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

test("the board outline draws every key and the trackball", () => {
    const markup = boardOutlineMarkup("mark");
    assert.match(markup, /^<svg class="mark" viewBox="20 96 1082 478"/);
    assert.equal(markup.match(/<rect /g)?.length, 56);
    assert.equal(markup.match(/<circle /g)?.length, 1);
    assert.equal(markup.match(/rotate\(/g)?.length, 7, "the angled thumb keys stay angled");
});

test("legend sizes follow the drawn key: clamp(9, .22k, 14) and clamp(8.5, .16k, 10.5) px", async () => {
    const {legendSize} = await import("../../webview/view/geometry.mjs");
    const px = (k, line) => legendSize(k, line).size * k / GEO.keyW;
    assert.ok(Math.abs(px(40, "main") - 9) < 1e-9, "a small key holds the 9 px floor");
    assert.ok(Math.abs(px(52, "main") - 0.22 * 52) < 1e-9, "a middling key scales");
    assert.ok(Math.abs(px(80, "main") - 14) < 1e-9, "a large key stops at 14 px");
    assert.ok(Math.abs(px(40, "sub") - 8.5) < 1e-9);
    assert.ok(Math.abs(px(80, "sub") - 10.5) < 1e-9);
    assert.ok(Math.abs(legendSize(40, "main").floor * 40 / GEO.keyW - 9) < 1e-9, "the floor is 9 px on screen at any size");
});

test("a long legend shrinks to the floor, then wraps, then squeezes no further than 0.85", async () => {
    const {legendFit, legendSize, wrapLegend, MAX_SQUEEZE} = await import("../../webview/view/geometry.mjs");
    const k = 44, width = GEO.keyW - 10, floor = legendSize(k, "main").floor;
    const short = legendFit("Esc", {k, line: "main", width, wrap: true});
    assert.deepEqual(short.lines, ["Esc"]);
    assert.equal(short.squeeze, 0);
    assert.ok(Math.abs(short.size - legendSize(k, "main").size) < 0.01, "a short legend takes the nominal size");

    const command = legendFit("Left Command", {k, line: "main", width, wrap: true});
    assert.deepEqual(command.lines, ["Left", "Command"], "two words too long for one line wrap before any squeeze");
    assert.ok(command.size >= floor - 0.01 && !command.belowFloor);

    const noWrap = legendFit("Left Command", {k, line: "main", width, wrap: false});
    assert.deepEqual(noWrap.lines, ["Left Command"]);
    assert.ok(noWrap.squeeze > 0 || noWrap.belowFloor, "without room to wrap it squeezes");
    if (noWrap.squeeze) assert.ok(noWrap.squeeze >= width * 0.99);

    const word = legendFit("Supercalifragilistic", {k, line: "main", width, wrap: true});
    assert.equal(word.lines.length, 1, "one word never wraps");
    assert.ok(word.squeeze > 0, "it is squeezed");
    assert.ok(word.belowFloor, "and goes below the floor only when 0.85 is not enough");
    assert.equal(MAX_SQUEEZE, 0.85);

    const parts = wrapLegend("Print Screen Now");
    assert.equal(parts?.length, 2, "a label with spaces splits in two");
    assert.equal(parts?.join(" "), "Print Screen Now", "keeping every word, in order");
    assert.equal(wrapLegend("Esc"), null);
    const room = legendFit("Esc", {k, line: "sub", width, room: 5});
    assert.equal(room.size, 5, "a row with less room caps the size, even under the floor");
});
