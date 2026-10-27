// @ts-check
// The keyboard button at the top of the rail: the keyboard's name, its edit
// mode and its dot, and the menu that holds the edit modes, the keyboards to
// switch between, Choose keyboard and Disconnect. Pure: it reads the
// published model, so what the button says and the menu offers is tested
// without a screen.

import {halvesWords, phaseWords} from "./vocabulary.mjs";
import {editModeChoices, liveSaveState} from "./edit-mode.mjs";
import {RESTART_NEEDED, SAVE_IN_PROGRESS} from "./keyboard-view.mjs";
import {shellOf} from "./shell-panel.mjs";
import {demoOf} from "./demo.mjs";

/** @typedef {import("../../contracts/panel.js").PublishedModel} Model */

// What the warning beside the mode says, and Settle's hover words.
export const SETTLE_TIP = "The halves stored different modes. Settle stores this one on both.";
export const NOT_STORED_TIP = "The keyboard has not stored its edit mode yet and keeps trying. Unplugging it now may lose the mode.";

/**
 * @param {Partial<Model> | null | undefined} model
 * @returns {{
 *   name: string,
 *   mode: null | {label: string, detail: string, warn: string},
 *   dot: {tone: string, tip: string, busy: boolean},
 *   disabled: boolean,
 *   edits: null | {choices: {value: number, label: string, hint: string, detail: string, current: boolean, offered: boolean}[], settle: boolean, notStored: boolean},
 *   keyboards: {id: string, label: string, current: boolean}[],
 *   choose: boolean,
 *   disconnect: boolean,
 *   opens: boolean,
 * }}
 */
export function keyboardControl(model) {
    const device = model?.device;
    const shell = shellOf(model);
    const demo = demoOf(model).active;
    // A keyboard that went to take its new name is shown under it, coming back.
    const reconnecting = model?.reconnecting;
    const connected = Boolean(device?.connected) && !reconnecting;
    const modes = connected && !demo && model?.draft ? editModeChoices(model) : null;
    const edits = modes && {
        choices: modes.choices.map(({value, label, hint, detail, offered}) => ({value, label, hint: hint || "", detail, current: value === modes.mode, offered})),
        settle: Boolean(modes.conflict),
        notStored: modes.notStored,
    };
    const current = edits?.choices.find((choice) => choice.current);
    const devices = model?.devices || [];
    const keyboards = reconnecting || devices.length < 2 ? []
        : devices.map(({id, label}) => ({id, label, current: id === model?.selectedDeviceId}));
    const choose = Boolean(shell.chooseKeyboard);
    const disconnect = choose && connected && !demo;
    return {
        name: reconnecting ? reconnecting.name || "Charybdis" : device?.label || "No keyboard connected",
        mode: current ? {label: current.label, detail: current.detail,
            warn: [edits?.settle ? SETTLE_TIP : "", edits?.notStored ? NOT_STORED_TIP : ""].filter(Boolean).join(" ")} : null,
        dot: keyboardDot(model),
        disabled: Boolean(device?.health?.busy),
        edits,
        keyboards,
        choose,
        disconnect,
        opens: Boolean(edits || keyboards.length || choose || disconnect),
    };
}

// The dot never changes the button's shape: what the keyboard is doing and
// whether its halves agree are its colour, said in words on hover, with what
// the keyboard says of itself that no bar or notice says: a restart it needs,
// a save it is finishing, and in the live modes its own saving.
/** @param {Partial<Model> | null | undefined} model @returns {{tone: string, tip: string, busy: boolean}} */
function keyboardDot(model) {
    const health = model?.device?.health;
    const reconnecting = model?.reconnecting;
    if (demoOf(model).active) return {tone: "demo", busy: false,
        tip: "Nothing is connected. The demo runs Ark's own draft over a demo setup; only saving needs a keyboard."};
    if (reconnecting) return {tone: "", busy: true,
        tip: reconnecting.restart ? "The keyboard is restarting. It comes back by itself in a moment, and Ark reads it again."
            : reconnecting.lost ? "Ark lost the keyboard and is connecting it again."
                : "Reconnecting so the keyboard takes its new name. It comes back by itself in a moment."};
    if (!model?.device?.connected) return {tone: "err", tip: "No keyboard is connected.", busy: false};
    const busy = Boolean(health?.busy);
    const halves = halvesWords(model, health?.halves);
    const tone = health?.restartNeeded ? "err" : health?.halves === "agree" ? "ok" : health?.halves === "unread" ? "" : "warn";
    const words = [
        health?.restartNeeded ? `${RESTART_NEEDED.label}. ${[RESTART_NEEDED.detail, ...RESTART_NEEDED.steps].join(" ")}` : "",
        `${halves.label}. ${halves.detail}`,
        health?.recoveryPending ? `${SAVE_IN_PROGRESS.label}. ${SAVE_IN_PROGRESS.detail}` : "",
        ...keyboardSaving(model?.draft),
    ].filter(Boolean);
    return {tone, busy, tip: `${busy ? `${phaseWords(model, health?.phase)?.label || "Working"}. ` : ""}${words.join(" ")}`};
}

// What the keyboard says of its own saving that the commit bar may not: a
// key adjustment still reaching both halves (in every edit mode), Live's
// "saved by the keyboard" once nothing is left unsaved, and the slave half
// still taking the last edit.
/** @param {Model["draft"] | undefined} draft */
function keyboardSaving(draft) {
    const adjustment = liveSaveState(draft);
    const beneath = liveSaveState(draft, {adjustment: false});
    return [
        adjustment?.kind === "adjustment" ? `${adjustment.title}. ${adjustment.detail}` : "",
        beneath?.kind === "saved" ? `${beneath.title}. ${beneath.detail}` : "",
        draft?.live && !draft.live.converged && !draft.live.slaveRefused
            ? "Slave half catching up. The master half runs the last edit; the slave half is still taking it." : "",
    ];
}
