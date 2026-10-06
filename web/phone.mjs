// What a phone gets instead of Ark: a notice that Ark runs on a computer, with
// the repositories, and nothing of the interface. No phone browser has WebHID,
// and the interface needs a computer's screen. A tablet is not a phone: it gets
// Ark, which there offers the demo and says it needs Chrome or Edge to connect.
//
// The page decides once, as it loads, so turning the phone or resizing a window
// never swaps Ark out from under a draft. A phone is touch only, with a
// phone-sized screen: its shorter side under PHONE_SCREEN pixels. The screen,
// not the window, so a narrow desktop window is never a phone; an iPad mini's
// shorter side is 744.

import {GEO, keyVisual} from "../webview/view/geometry.mjs";
import {ARK_REPOSITORY, GITHUB_MARK, buildLine, commitUrl} from "../webview/view/host.mjs";

export const PHONE_SCREEN = 600;
const KEYS = 56;
const SVG = "http://www.w3.org/2000/svg";

export const PHONE_LINKS = Object.freeze([
    Object.freeze({label: "Ark on GitHub", href: ARK_REPOSITORY, github: true}),
    Object.freeze({label: "The firmware on GitHub", href: "https://github.com/NoahCLR/charybdis-4x6", github: true}),
]);


// The keyboard's maker and official seller, in Noah's words from the
// firmware's README.
export const PHONE_SELLER = Object.freeze({
    words: "The Charybdis is an open-source design from BastardKB. It has given me hundreds of hours of good firmware and hardware tinkering. If you want one, buy it from BastardKB, not from a knockoff seller.",
    label: "Buy a Charybdis from BastardKB",
    href: "https://bastardkb.com/",
});

export function isPhone({matchMedia, screen} = {}) {
    const touchOnly = Boolean(matchMedia?.("(hover: none) and (pointer: coarse)")?.matches);
    const shorter = Math.min(Number(screen?.width) || Infinity, Number(screen?.height) || Infinity);
    return touchOnly && shorter < PHONE_SCREEN;
}

// Fills `root` with the notice. Text goes in as text, never as markup.
export function showPhoneNotice({document, root, address, build}) {
    const make = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const notice = make("main", "phone-notice");
    notice.append(
        boardOutline(document),
        make("h1", "", "Ark runs on a computer"),
        make("p", "", "Ark edits your Charybdis over USB, from Chrome or Edge on a computer. A phone can't reach the keyboard, so there is nothing to edit here."),
    );
    if (address) {
        const there = make("p", "", "Open this page there: ");
        there.append(make("span", "mono", address));
        notice.append(there);
    }
    const links = (list) => {
        const nav = make("nav", "phone-links");
        for (const {label, href, github} of list) {
            const link = make("a", "", label);
            link.href = href;
            if (github) link.prepend(githubMarkOf(document, "phone-icon"));
            nav.append(link);
        }
        return nav;
    };
    // The build it came from, linked to its commit on GitHub when it has one.
    const url = commitUrl(build);
    const built = make(url ? "a" : "p", "phone-build mono");
    if (url) {
        built.href = url;
        built.append(githubMarkOf(document, "phone-build-mark"));
    }
    built.append(document.createTextNode(buildLine(build)));
    notice.append(links(PHONE_LINKS), make("p", "phone-seller", PHONE_SELLER.words), links([PHONE_SELLER]), built);
    root.replaceChildren(notice);
    return notice;
}

function githubMarkOf(document, className) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(SVG, "path");
    shape.setAttribute("d", GITHUB_MARK);
    svg.append(shape);
    return svg;
}

// The board's shape alone: every key and the trackball where the panel's
// board puts them (webview/view/geometry.mjs), with no legends.
export function boardOutline(document) {
    const make = (tag, attributes) => {
        const node = document.createElementNS(SVG, tag);
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
        return node;
    };
    const svg = make("svg", {class: "phone-board", viewBox: GEO.viewBox, role: "img", "aria-label": "The Charybdis keyboard"});
    const {x, y, r} = GEO.trackball;
    svg.append(make("circle", {class: "phone-ball", cx: x, cy: y, r}));
    for (let index = 0; index < KEYS; index += 1) {
        const visual = keyVisual(index);
        const key = make("rect", {class: "phone-key", x: visual.x, y: visual.y, width: GEO.keyW, height: GEO.keyH, rx: GEO.radius});
        if (visual.angle) key.setAttribute("transform", `rotate(${visual.angle} ${visual.x + GEO.keyW / 2} ${visual.y + GEO.keyH / 2})`);
        svg.append(key);
    }
    return svg;
}
