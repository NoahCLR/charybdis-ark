import assert from "node:assert/strict";
import test from "node:test";
import {brightnessLimit, clampHsv, css, hsv, idealText, label, rgb, valuePercent} from "../../webview/lib/colour.mjs";
import {isOff, isPassthrough} from "../../webview/view/lighting.mjs";

const colour = (h, s, v) => ({h: String(h), s: String(s), v: String(v)});

test("device colours are read as QMK's 0-255 HSV, strings included", () => {
    assert.deepEqual(hsv(colour(140, 210, 180)), [140, 210, 180]);
    assert.deepEqual(hsv(undefined), [0, 0, 0]);
    assert.equal(isPassthrough(colour(140, 0, 0)), true, "saturation and value zero is passthrough whatever the hue says (firmware D-F74)");
    assert.equal(isPassthrough(colour(140, 255, 0)), false, "value zero with saturation is black, which paints");
    assert.equal(isOff(colour(140, 255, 0)), true);
    assert.equal(isOff(colour(0, 0, 0)), false, "passthrough is not black");
    assert.equal(isPassthrough(colour(0, 0, 1)), false);
    assert.equal(label(colour(18, 255, 200)), "HSV(18, 255, 200)");
});

test("hue 0 is red, a third of the wheel is green, a value of zero is black", () => {
    assert.deepEqual(rgb(colour(0, 255, 255)), [255, 0, 0]);
    assert.deepEqual(rgb(colour(85, 255, 255)), [0, 255, 0]);
    assert.deepEqual(rgb(colour(170, 255, 255)), [0, 0, 255]);
    assert.deepEqual(rgb(colour(0, 0, 0)), [0, 0, 0]);
    assert.equal(css(colour(0, 0, 255)), "rgb(255, 255, 255)");
});

test("legends flip to black only when the key is genuinely bright", () => {
    assert.match(idealText(colour(43, 255, 255)), /rgba\(0,0,0/, "yellow takes a black legend");
    assert.match(idealText(colour(170, 255, 200)), /rgba\(255,255,255/, "blue takes a white one");
    assert.match(idealText(colour(0, 0, 0)), /rgba\(255,255,255/, "an unlit key stays white");
});

test("the colour picker uses the keyboard's reported brightness space", () => {
    assert.equal(brightnessLimit(200), 200);
    assert.equal(brightnessLimit(undefined), 255, "older models retain the full byte range");
    assert.deepEqual(clampHsv([300, -2, 239], 200), {h: 255, s: 0, v: 200});
    assert.equal(valuePercent(100, 200), 50);
    assert.equal(valuePercent(239, 200), 100);
    assert.equal(valuePercent(10, 0), 0);
});
