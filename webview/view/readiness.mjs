// @ts-check
// The Configure screens show a board only after a complete editable read.
// The host keeps the gate closed across the small gaps between HID requests.

import {configureReady, screenAvailable, screenDefinition} from "./screens.mjs";
export {configureReady, screenAvailable};

/** @typedef {import("../../contracts/model.js").StatusModel} StatusModel */
/** @typedef {import("../../contracts/model.js").CountedProgress} CountedProgress */

import {phaseWords} from "./vocabulary.mjs";

/** @type {Readonly<Record<string, string>>} */
const POST_APPLY_READ = {
    layout: "Reading keys and layers",
    profile: "Reading saved lighting, behaviours and settings",
    combos: "Checking active combos",
    baseRgb: "Checking base lighting",
};

/** @param {{step: string, progress?: CountedProgress | null} | null | undefined} read */
export function postApplyReadText(read) {
    const label = (read ? POST_APPLY_READ[read.step] : undefined) || "Confirming the completed save";
    const progress = read?.progress;
    return progress && Number.isInteger(progress.done) && Number.isInteger(progress?.total) && progress.total > 0
        ? `${label} · ${progress.done} of ${progress.total}` : label;
}

// The commit bar while the keyboard is busy with anything but an Apply: what
// is happening in words, and whether it writes to the keyboard. Reads and
// exports save nothing, so they make no claim about the saved profile.
/** @param {import("../../contracts/model.js").PhaseId | undefined} phase @param {StatusModel | null | undefined} model */
export function busyText(phase, model) {
    const words = phaseWords(model, phase);
    return {detail: words?.busy || "Finishing the current step", writes: words?.writes || false};
}

/** @param {StatusModel | null | undefined} model @param {string} [screen] */
export function readScreen(model, screen = "keys") {
    const definition = screenDefinition(screen);
    if (!definition) return {state: "unavailable", title: "Screen unavailable",
        detail: "Choose a screen from the menu to continue."};
    // A host that cannot reach a keyboard at all says why, in place of reading.
    if (model?.host?.blocked) return {state: "blocked", title: model.host.blocked.title, detail: model.host.blocked.detail};
    if (!model || model.load?.state === "loading") {
        const phase = model?.load?.phase;
        const progress = model?.load?.progress;
        const count = progress && typeof progress !== "string" && Number.isInteger(progress.done) && Number.isInteger(progress.total) && progress.total > 0
            ? ` · ${progress.done} of ${progress.total}` : "";
        return {state: "loading", title: "Reading your keyboard", detail: typeof progress === "string" && progress ? progress : `${phaseWords(model, phase)?.read || (!phase ? "Looking for a keyboard" : "Finishing the read")}${count}`};
    }
    if (!screenAvailable(model, screen) && definition.unavailable) return {state: "unavailable", ...definition.unavailable};
    if (configureReady(model)) return null;
    const device = model.device || {};
    if (!device.connected) return {state: "connect", title: "Connect your Charybdis",
        detail: device.health?.error || model.host?.words?.connectHint || "Connect a Charybdis, then read it to begin editing."};
    // Halves that are not together are the usual reason, and say what to do.
    const halves = device.health?.halves;
    const halvesDetail = halves === "alone" || halves === "apart" ? model.vocabulary?.halves?.[halves]?.detail : "";
    return {state: "unavailable", title: "Keyboard not ready for edits",
        detail: halvesDetail || device.health?.error || "A complete profile could not be read. Read the keyboard again to retry."};
}
