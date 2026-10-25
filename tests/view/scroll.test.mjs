import assert from "node:assert/strict";
import test from "node:test";

import {captureContentScroll, captureKeysBenchHeight, revealSelectedContentRow, revealSelectedListRow, restoreContentScroll, restoreKeysBenchHeight, scrollContentTo} from "../../webview/lib/scroll.mjs";

const rootWith = (content) => ({querySelector: (selector) => selector === ".content" ? content : null});
// A selector list matches when any of its selectors is the one asked about.
const matches = (selector, one) => selector.split(",").map((part) => part.trim()).includes(one);

test("rerendering a screen preserves its content scroll position", () => {
    const before = {scrollTop: 840, scrollLeft: 36};
    const scroll = captureContentScroll(rootWith(before), "lighting", "lighting");
    assert.deepEqual(scroll, {top: 840, left: 36});

    const after = {scrollTop: 0, scrollLeft: 0};
    restoreContentScroll(rootWith(after), scroll);
    assert.deepEqual(after, {scrollTop: 840, scrollLeft: 36});
});

test("a slot bank keeps its own scroll position beside the page's", () => {
    // Macros and Custom keys draw their bank the same way; each keeps its place.
    const rootOf = (content, bank) => ({querySelector: (selector) =>
        selector === ".content" ? content : selector === ".pad.library .macro-grid" ? bank : null});
    const scroll = captureContentScroll(rootOf({scrollTop: 0, scrollLeft: 0}, {scrollTop: 2310, scrollLeft: 0}), "customKeys", "customKeys");
    assert.deepEqual(scroll, {top: 0, left: 0, bank: {top: 2310, left: 0}});

    const bank = {scrollTop: 0, scrollLeft: 0};
    restoreContentScroll(rootOf({scrollTop: 0, scrollLeft: 0}, bank), scroll);
    assert.deepEqual(bank, {scrollTop: 2310, scrollLeft: 0});
});

test("a taller Keys tab keeps enough page height when another tab is shown", () => {
    const previous = {querySelector: (selector) => selector === ".keys-pad .bench"
        ? {getBoundingClientRect: () => ({height: 820})} : null};
    const height = captureKeysBenchHeight(previous, "keys", "keys");
    const nextBench = {style: {minHeight: ""}};
    restoreKeysBenchHeight({querySelector: () => nextBench}, height);
    assert.equal(nextBench.style.minHeight, "820px");
    assert.equal(captureKeysBenchHeight(previous, "keys", "lighting"), 0,
        "leaving Keys starts the other screen at its own height");
    assert.equal(captureKeysBenchHeight(previous, "keys", "keys", true), 0,
        "an explicit section toggle lets a collapsed workbench shrink");
});

test("a list that scrolls beside its editor keeps its place, under its own key", () => {
    const rootOf = (content, list) => ({querySelector: (selector) =>
        selector === ".content" ? content : selector === "[data-scroll-list]" ? list : null});
    const layers = {scrollTop: 557, dataset: {scrollList: "layers"}};
    const scroll = captureContentScroll(rootOf({scrollTop: 0, scrollLeft: 0}, layers), "lighting", "lighting");
    assert.deepEqual(scroll, {top: 0, left: 0, list: {key: "layers", top: 557}});
    const redrawn = {scrollTop: 0, dataset: {scrollList: "layers"}};
    restoreContentScroll(rootOf({scrollTop: 0, scrollLeft: 0}, redrawn), scroll);
    assert.equal(redrawn.scrollTop, 557);
    const pointing = {scrollTop: 0, dataset: {scrollList: "pd"}};
    restoreContentScroll(rootOf({scrollTop: 0, scrollLeft: 0}, pointing), scroll);
    assert.equal(pointing.scrollTop, 0, "another list does not take this one's place");
});

test("a list's picked row is brought into view below its heading, and left alone when visible", () => {
    const row = {getBoundingClientRect: () => ({top: 700, bottom: 760})};
    const list = {scrollTop: 0, getBoundingClientRect: () => ({top: 100, bottom: 660}),
        querySelector: (selector) => matches(selector, ".rowitem.on") ? row : matches(selector, ".rowlist-h") ? {getBoundingClientRect: () => ({height: 34})} : null};
    const root = {querySelector: (selector) => selector === "[data-scroll-list]" ? list : null};
    revealSelectedListRow(root);
    assert.equal(list.scrollTop, 100, "scrolled just far enough to show the row");
    row.getBoundingClientRect = () => ({top: 110, bottom: 170});
    revealSelectedListRow(root);
    assert.equal(list.scrollTop, 76, "a row under the sticky heading comes out below it");
    row.getBoundingClientRect = () => ({top: 300, bottom: 360});
    revealSelectedListRow(root);
    assert.equal(list.scrollTop, 76, "a visible row stays put");
    assert.doesNotThrow(() => revealSelectedListRow({querySelector: () => null}));
});

test("a reach table's moved pick comes out below its column header and its group's band", () => {
    // The Keys tables stick their column header and the band of the group in
    // view; only a pick that moved is marked for revealing.
    const band = {getBoundingClientRect: () => ({height: 34})};
    const row = {getBoundingClientRect: () => ({top: 120, bottom: 156}),
        closest: (selector) => selector === "tbody" ? {querySelector: (inner) => inner === ".t-group" ? band : null} : null};
    const list = {scrollTop: 300, getBoundingClientRect: () => ({top: 100, bottom: 600}),
        querySelector: (selector) => matches(selector, "[data-reveal-selected]") ? row
            : matches(selector, "thead") ? {getBoundingClientRect: () => ({height: 24})} : null};
    revealSelectedListRow({querySelector: (selector) => selector === "[data-scroll-list]" ? list : null});
    assert.equal(list.scrollTop, 262, "scrolled up past the header (24) and the band (34)");
    row.getBoundingClientRect = () => ({top: 590.4, bottom: 626.4});
    revealSelectedListRow({querySelector: (selector) => selector === "[data-scroll-list]" ? list : null});
    assert.equal(list.scrollTop, 289, "a fraction short of the edge rounds out to a whole pixel");
});

test("navigating to another screen starts at the top", () => {
    const content = {scrollTop: 840, scrollLeft: 36};
    assert.equal(captureContentScroll(rootWith(content), "lighting", "keys"), null);
});

test("scroll preservation tolerates screens without a content container", () => {
    const root = rootWith(null);
    assert.equal(captureContentScroll(root, "keys", "keys"), null);
    assert.doesNotThrow(() => restoreContentScroll(root, {top: 10, left: 2}));
});

test("jumping from the combo builder places the board below the content edge", () => {
    const calls = [];
    const board = {getBoundingClientRect: () => ({top: -260})};
    const content = {scrollTop: 900, scrollLeft: 12, getBoundingClientRect: () => ({top: 80}),
        querySelector: (selector) => selector === ".board-card" ? board : null,
        scrollTo: (options) => calls.push(options)};
    scrollContentTo(rootWith(content), ".board-card");
    assert.deepEqual(calls, [{top: 540, left: 12, behavior: "smooth"}]);
});

test("a newly selected behaviour is revealed in the outer content scroller", () => {
    const selected = {getBoundingClientRect: () => ({top: 330, bottom: 380})};
    const content = {scrollTop: 170, querySelector: (selector) => selector === "[data-reveal-selected]" ? selected : null,
        getBoundingClientRect: () => ({top: 100, bottom: 350})};
    revealSelectedContentRow(rootWith(content));
    assert.equal(content.scrollTop, 212);
    selected.getBoundingClientRect = () => ({top: 90, bottom: 120});
    revealSelectedContentRow(rootWith(content));
    assert.equal(content.scrollTop, 190, "a selection above the viewport also uses the same scroller");
    assert.doesNotThrow(() => revealSelectedContentRow(rootWith(null)));
});
