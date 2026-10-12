// @ts-check
// The Configure screens show a board only after a complete editable read.
// The host keeps the gate closed across the small gaps between HID requests.

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

/** @param {StatusModel | null | undefined} model */
export const configureReady = (model) => model?.load?.state === "ready";

/** @param {StatusModel | null | undefined} model @param {string} screen */
export function screenAvailable(model, screen) {
    if (!model || model.load?.state === "loading") return false;
    if (screen === "device") return Boolean(model.device?.connected || model.demo?.active);
    if (screen === "profile") return Boolean(model.portable?.available);
    return configureReady(model);
}

/** @param {StatusModel | null | undefined} model @param {string} [screen] */
export function readScreen(model, screen = "keys") {
    // A host that cannot reach a keyboard at all says why, in place of reading.
    if (model?.host?.blocked) return {state: "blocked", title: model.host.blocked.title, detail: model.host.blocked.detail};
    if (!model || model.load?.state === "loading") {
        const phase = model?.load?.phase;
        const progress = model?.load?.progress;
        const count = progress && typeof progress !== "string" && Number.isInteger(progress.done) && Number.isInteger(progress.total) && progress.total > 0
            ? ` · ${progress.done} of ${progress.total}` : "";
        return {state: "loading", title: "Reading your keyboard", detail: typeof progress === "string" && progress ? progress : `${phaseWords(model, phase)?.read || (!phase ? "Looking for a keyboard" : "Finishing the read")}${count}`};
    }
    if (screen === "profile" && !screenAvailable(model, screen)) return {state: "unavailable", title: "Backups unavailable",
        detail: "Connect a keyboard with complete-profile firmware, then read it to manage backups."};
    if (screen === "device" && !screenAvailable(model, screen)) return {state: "unavailable", title: "Device status unavailable",
        detail: "Read the keyboard to see its connection and diagnostics."};
    if (configureReady(model)) return null;
    const device = model.device || {};
    if (!device.connected) return {state: "unavailable", title: "Connect your keyboard",
        detail: device.health?.error || model.host?.words?.connectHint || "Connect a Charybdis, then read it to begin editing."};
    return {state: "unavailable", title: "Keyboard not ready for edits",
        detail: device.health?.error || "A complete profile could not be read. Read the keyboard again to retry."};
}
