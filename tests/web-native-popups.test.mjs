// While a <select>'s native menu may be open (Chrome on macOS holds back the
// page's input reports then) or the page is hidden, the web shell pauses its
// looks at a live keyboard (web/native-popups.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import {nativePopups} from "../web/native-popups.mjs";

function page() {
    const target = new EventTarget();
    return Object.assign(target, {visibilityState: "visible"});
}
/** @param {EventTarget} document @param {string} type @param {object} target @param {object} [extra] */
function fire(document, type, target, extra = {}) {
    const event = new Event(type);
    Object.defineProperty(event, "target", {value: target});
    for (const [key, value] of Object.entries(extra)) Object.defineProperty(event, key, {value});
    document.dispatchEvent(event);
}
const select = {tagName: "SELECT", multiple: false, size: 0, disabled: false};
const button = {tagName: "BUTTON"};

test("a press on a select pauses the looks until the next event, which means its menu closed", () => {
    const document = page();
    const popups = nativePopups(/** @type {any} */ (document));
    assert.equal(popups.paused(), false);
    fire(document, "pointerdown", select);
    assert.equal(popups.paused(), true, "its menu may be open");
    fire(document, "change", select);
    assert.equal(popups.paused(), false, "a choice closed it");
    fire(document, "pointerdown", select);
    fire(document, "pointermove", button);
    assert.equal(popups.paused(), false, "a move after it closed without a choice");
    fire(document, "pointerdown", button);
    assert.equal(popups.paused(), false, "other controls open no native menu");
    fire(document, "pointerdown", {...select, size: 5});
    assert.equal(popups.paused(), false, "a list box shows its rows in the page");
});

// A real press moves focus to the select: the control that had it (a button
// clicked before) loses it just after the press. That is not the menu
// closing; seen on the keyboard in Chrome 153 on macOS, where it let three
// looks go unanswered and dropped the keyboard.
test("focus leaving another control as the select takes it keeps the looks paused", () => {
    const document = page();
    const popups = nativePopups(/** @type {any} */ (document));
    fire(document, "pointerdown", select);
    fire(document, "focusout", button, {relatedTarget: select});
    assert.equal(popups.paused(), true, "the menu is still open");
    fire(document, "focusout", select);
    assert.equal(popups.paused(), false, "the select losing focus closed it");
    fire(document, "keydown", select, {key: "ArrowDown"});
    fire(document, "focusout", button);
    assert.equal(popups.paused(), true, "a menu opened by a key stays open while another control loses focus");
    fire(document, "pointermove", button);
    assert.equal(popups.paused(), false);
});

test("the keys that open a focused select's menu pause the looks; other keys do not", () => {
    const document = page();
    const popups = nativePopups(/** @type {any} */ (document));
    fire(document, "keydown", select, {key: " "});
    assert.equal(popups.paused(), true);
    fire(document, "focusout", select);
    assert.equal(popups.paused(), false);
    fire(document, "keydown", select, {key: "a"});
    assert.equal(popups.paused(), false);
});

test("a hidden page pauses the looks", () => {
    const document = page();
    const popups = nativePopups(/** @type {any} */ (document));
    document.visibilityState = "hidden";
    assert.equal(popups.paused(), true);
    document.visibilityState = "visible";
    assert.equal(popups.paused(), false);
});
