// The web page's phone check (web/phone.mjs): a phone is touch only with a
// phone-sized screen. Tablets and desktop windows, however narrow, get Ark.
// The notice itself, in a phone's Chrome, is browser-tests/web-page.spec.js's.

import assert from "node:assert/strict";
import test from "node:test";
import {PHONE_LINKS, PHONE_SCREEN, PHONE_SELLER, isPhone} from "../web/phone.mjs";

// matchMedia as a device answers the touch-only query.
const media = (touchOnly) => (query) => ({matches: query === "(hover: none) and (pointer: coarse)" && touchOnly});

test("a phone is touch only with a phone-sized screen, whichever way it is turned", () => {
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 390, height: 844}}), true, "an iPhone");
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 844, height: 390}}), true, "turned on its side");
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 412, height: 915}}), true, "an Android phone");
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 440, height: 956}}), true, "the largest iPhone");
});

test("a tablet is not a phone: it gets Ark and its demo", () => {
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 744, height: 1133}}), false, "an iPad mini");
    assert.equal(isPhone({matchMedia: media(true), screen: {width: 1024, height: 1366}}), false, "a large iPad");
    assert.ok(744 >= PHONE_SCREEN);
});

test("a computer is never a phone, however small its window or screen", () => {
    assert.equal(isPhone({matchMedia: media(false), screen: {width: 1512, height: 982}}), false);
    assert.equal(isPhone({matchMedia: media(false), screen: {width: 360, height: 640}}), false, "a mouse means a computer");
    assert.equal(isPhone({matchMedia: media(true), screen: {}}), false, "no screen size: not a phone");
    assert.equal(isPhone({screen: {width: 390, height: 844}}), false, "no matchMedia: not a phone");
    assert.equal(isPhone(), false);
});

test("the notice links to Ark's and the firmware's repositories, on GitHub only", () => {
    assert.deepEqual(PHONE_LINKS.map((link) => link.href),
        ["https://github.com/NoahCLR/charybdis-ark", "https://github.com/NoahCLR/charybdis-4x6"]);
});

test("the notice sends a buyer to BastardKB, the keyboard's official seller", () => {
    assert.equal(PHONE_SELLER.href, "https://bastardkb.com/");
    assert.match(PHONE_SELLER.words, /buy it from BastardKB, not from a knockoff seller/);
});
