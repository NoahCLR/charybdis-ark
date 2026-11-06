import assert from "node:assert/strict";
import test from "node:test";
import {GEO, LEGEND_CONDENSE, LEGEND_SIZES, boardOutlineMarkup, estimateWidth, inLocality, isRightHalf, keyFaceRows, keyLegends, keyVisual, legendBreak, setLegend, trackballInLocality} from "../../webview/view/geometry.mjs";

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

const ROOM = GEO.keyW - 10;
const texts = (legend) => legend.lines.map((line) => line.text);

test("a legend is drawn at one of two sizes: a single character large, every name at the word size", () => {
    for (const glyph of ["A", "1", "/", "▽", ";"]) assert.equal(setLegend(glyph, {room: ROOM, twoLines: true}).size, LEGEND_SIZES.glyph, glyph);
    for (const name of ["Esc", "Tab", "Del", "F12", "Enter", "Left Shift", "Left Ctrl", "Backspace", "Command+Q", "Macro 0"]) {
        assert.equal(setLegend(name, {room: ROOM, twoLines: true}).size, LEGEND_SIZES.word, `${name}: a name is a word, however short`);
    }
    // Over a line the tap is set the same way.
    assert.equal(setLegend("F", {room: GEO.keyW - 12, twoLines: false}).size, LEGEND_SIZES.glyph);
    assert.equal(setLegend("Spacebar", {room: GEO.keyW - 12, twoLines: false}).size, LEGEND_SIZES.word);
});

test("a name of two or more words takes two lines, so whether a key wraps never depends on its width", () => {
    // Left and Right of a pair always read alike, as do short and long names.
    for (const [name, lines] of [["Left Thumb", ["Left", "Thumb"]], ["Right Thumb", ["Right", "Thumb"]], ["Left Ctrl", ["Left", "Ctrl"]],
        ["Right Option", ["Right", "Option"]], ["OCR Copy", ["OCR", "Copy"]], ["VS Code Run Task", ["VS Code", "Run Task"]]]) {
        assert.deepEqual(texts(setLegend(name, {room: ROOM, twoLines: true})), lines, name);
    }
    assert.deepEqual(texts(setLegend("Backspace", {room: ROOM, twoLines: true})), ["Backspace"], "one word stays one line");
    assert.deepEqual(legendBreak("Slot 6 · hold (empty)"), ["Slot 6", "hold (empty)"], "a name joined by a · breaks there");
    assert.deepEqual(legendBreak("Custom key 0"), ["Custom", "key 0"], "a number stays with its word");
    assert.equal(legendBreak("Macro 0"), null, "a word and its number do not break");
    assert.deepEqual(legendBreak("Layer 1 Toggle"), ["Layer 1", "Toggle"], "a number is never the start of a line");
    assert.deepEqual(legendBreak("1 Password Fill"), ["1 Password", "Fill"], "nor a line of its own");
    assert.deepEqual(legendBreak("Back / Forward · hold · tap"), ["Back / Forward", "hold · tap"], "with several dots it breaks at one, the dot dropped");
    assert.equal(legendBreak("Spacebar"), null);
    // A tap over a line keeps one line: the hold has the room under it.
    assert.deepEqual(texts(setLegend("Left Thumb", {room: GEO.keyW - 12, twoLines: false})), ["Left Thumb"]);
});

test("a line too wide is condensed at its size before the legend steps down, and every word is kept", () => {
    // A measure that makes each character exactly as wide as its size.
    const square = (text, size) => [...text].length * size;
    const fits = Math.floor(ROOM / LEGEND_SIZES.word);
    assert.deepEqual(setLegend("x".repeat(fits), {room: ROOM, twoLines: true}, square).lines[0].squeeze, 0, "a line that fits runs at its width");
    const condensed = setLegend("x".repeat(fits + 1), {room: ROOM, twoLines: true}, square);
    assert.equal(condensed.size, LEGEND_SIZES.word, "a little too wide keeps the word size");
    assert.equal(condensed.lines[0].squeeze, ROOM, "and is condensed into the row");
    const stepped = setLegend("x".repeat(Math.ceil(ROOM / LEGEND_CONDENSE / LEGEND_SIZES.word) + 1), {room: ROOM, twoLines: true}, square);
    assert.equal(stepped.size, LEGEND_SIZES.step, "past what condensing allows, the legend steps down");
    const long = setLegend("Supercalifragilisticexpialidocious", {room: ROOM, twoLines: true});
    assert.equal(long.size, LEGEND_SIZES.step, "one size down is the floor");
    assert.equal(long.lines[0].squeeze, ROOM, "past it, the line is condensed into the row");
    assert.deepEqual(texts(long), ["Supercalifragilisticexpialidocious"], "never cut");
});

test("every legend stays on its cap, between the rows above it and the icons, line or hold below it", () => {
    const y = 100;
    const names = ["A", "Esc", "Left Command", "Slot 20 · lock (empty)", "VS Code Preview MD", "Supercalifragilisticexpialidocious"];
    const sizes = new Set();
    for (const tiers of [false, true]) for (const combos of [false, true]) for (const icons of [false, true]) for (const sub of ["", "Navigation"]) for (const main of names) {
        const rows = keyFaceRows(y, {tiers, combos, sub: Boolean(sub), icons});
        const legend = keyLegends(rows, {main, sub});
        const what = `${main}${sub ? ` / ${sub}` : ""} (tiers ${tiers}, combos ${combos}, icons ${icons})`;
        sizes.add(legend.size);
        const top = Math.max(y, rows.comboY !== undefined ? rows.comboY + rows.comboHeight : rows.tierY !== undefined ? rows.tierY + 3.9 : y);
        const bottom = Math.min(y + GEO.keyH, rows.iconY ?? Infinity, rows.separatorY ?? Infinity);
        // A line's letters stand about 0.72 of its size tall about its middle.
        for (const line of legend.lines) {
            assert.ok(line.y - legend.size * 0.36 >= top - 0.5 && line.y + legend.size * 0.36 <= bottom + 0.5, `${what}: "${line.text}" stays in its band`);
            assert.ok((line.squeeze || estimateWidth(line.text, legend.size, 400)) <= GEO.keyW - 10 + 0.01, `${what}: "${line.text}" stays across the cap`);
        }
        if (sub) assert.equal(legend.sub?.size, LEGEND_SIZES.hold, `${what}: the hold is one size`);
        if (sub) assert.equal(legend.sub?.squeeze, 0, `${what}: a hold that fits runs at its width`);
    }
    assert.deepEqual([...sizes].sort((a, b) => a - b), [LEGEND_SIZES.step, LEGEND_SIZES.word, LEGEND_SIZES.glyph], "the scale is every size a legend takes");
    const long = keyLegends(keyFaceRows(y, {sub: true}), {main: "F", sub: "Navigation Extra Media Numbers"});
    assert.equal(long.sub?.size, LEGEND_SIZES.hold, "a hold too long keeps its size");
    assert.equal(long.sub?.squeeze, GEO.keyW - 12, "and is condensed into the row under the line");
});

test("the board outline draws every key and the trackball", () => {
    const markup = boardOutlineMarkup("mark");
    assert.match(markup, /^<svg class="mark" viewBox="20 96 1082 478"/);
    assert.equal(markup.match(/<rect /g)?.length, 56);
    assert.equal(markup.match(/<circle /g)?.length, 1);
    assert.equal(markup.match(/rotate\(/g)?.length, 7, "the angled thumb keys stay angled");
});
