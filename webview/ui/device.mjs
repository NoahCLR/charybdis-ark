// @ts-check
import * as controls from "../view/controls.mjs";
import {el, esc} from "../lib/dom.mjs";
import {getModel, post, postLeavingDemo} from "../store.mjs";
import {demoOf} from "../view/demo.mjs";
import {halvesWords, phaseWords} from "../view/vocabulary.mjs";
import {topbar} from "./shell.mjs";

/** @param {readonly (readonly [string, unknown])[]} rows */
const kv = (rows) => `<dl class="kv device-kv">${rows
    .map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value ?? "—")}</dd>`).join("")}</dl>`;
/** @param {import("../../contracts/panel.js").PublishedModel | null} model */
const whatWasRead = (model) => `<div class="card"><div class="card-h"><h3>What was read</h3></div>
    <div class="list">${(model?.diagnostics || []).map((note) =>
        `<div class="list-row note-row"><span class="note">${esc(note)}</span></div>`).join("")
        || `<div class="list-row"><span class="note">Nothing has been read yet.</span></div>`}</div></div>`;
/** @param {string} dot @param {string} words */
const chip = (dot, words) => `<span class="right"><span class="chip"><i class="dot ${esc(dot)}"></i>${esc(words)}</span></span>`;

// The Device screen: what the keyboard says about itself, in two cards (its
// connection, and the setup it holds) over what was read. In the demo it says
// what stands in for a keyboard, and that it is not one; reading a keyboard
// from there leaves the demo, asking first.
export function screenDevice() {
    const model = getModel();
    const device = model?.device, demo = demoOf(model);
    const changes = model?.draft ? `${model.draft.changes.length} change${model.draft.changes.length === 1 ? "" : "s"}` : "none";
    const page = demo.active ? {
        sub: "No keyboard is connected. The demo stands in for one running current firmware, so every screen works; nothing here reaches a keyboard.",
        connectionChip: chip("demo", "no keyboard"),
        connectionBody: kv([
            ["Product", device?.label],
            ["Status", device?.subtitle],
        ]),
        setupTitle: "Demo setup",
        setupChip: chip("demo", "demo"),
        setupBody: kv([
            ["Opened", demo.fileName || demo.name],
            ["Draft", changes],
        ]),
        read: () => postLeavingDemo(controls.control("refresh")),
    } : {
        sub: "The keyboard that is connected: whether its halves are together, and what Ark has read from it.",
        connectionChip: chip(device?.connected ? "ok" : "err", device?.connected ? "connected" : "disconnected"),
        connectionBody: `${kv([
            ["Product", device?.label],
            ["Status", device?.subtitle],
            ["Phase", phaseWords(model, device?.health?.phase)?.label],
        ])}<p class="note">The master half connects over USB; the slave half connects to it through the cable between the halves.</p>`,
        setupTitle: "Saved profile",
        setupChip: chip(device?.health?.halves === "agree" ? "ok" : "warn", halvesWords(model, device?.health?.halves).label.toLowerCase()),
        setupBody: `${kv([
            ["Generation and digest", device?.summary],
            ["Recovery", device?.health?.recoveryPending ? "pending" : "clear"],
            ["Draft", changes],
        ])}${["alone", "apart"].includes(device?.health?.halves || "") ? `<p class="note">${esc(halvesWords(model, device?.health?.halves).detail)}</p>` : ""}`,
        read: () => post(controls.control("refresh")),
    };
    const main = el(`<div class="main">${topbar(
        "Device",
        page.sub
    )}
        <div class="content"><div class="pad stack device-pad">
            <div class="grid2">
                <div class="card"><div class="card-h"><h3>Connection</h3>
                    ${page.connectionChip}</div>
                    <div class="card-b stack gap-12">${page.connectionBody}
                        <button class="btn self-start" data-act="read" ${device?.health?.busy ? "disabled" : ""}>Read from keyboard</button></div></div>
                <div class="card"><div class="card-h"><h3>${page.setupTitle}</h3>
                    ${page.setupChip}</div>
                    <div class="card-b stack gap-12">${page.setupBody}</div></div>
            </div>
            ${whatWasRead(model)}
        </div></div></div>`);
    /** @type {HTMLButtonElement} */ (main.querySelector('[data-act="read"]')).addEventListener("click", page.read);
    return main;
}
