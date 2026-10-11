// @ts-check
// Reply handling is shared by every screen. Counters update progress without
// replacing editors, and delayed replies must still belong to this read/draft.
import {closeComboBuilder, getModel, layerName, post, resetDraftForms, setModel, state} from "./store.mjs";
import {control} from "./view/controls.mjs";
import {hostOf} from "./view/host.mjs";
import {readScreen} from "./view/readiness.mjs";
import {sameEditorContent} from "./view/render-content.mjs";

/**
 * @param {{root: HTMLElement, refreshCommitBar: () => void, render: (options: {keepScreen: boolean}) => void, receiveMacroValidation: (message: Extract<import("../contracts/messages.js").PanelResponse, {type: 'macroValidation'}>) => void}} surface
 */
export function createPanelMessages({root, refreshCommitBar, render, receiveMacroValidation}) {
    let inDemo = false;
    /** @type {string | null} */
    let lastStackKey = null;
    /** @param {import("../contracts/messages.js").PanelResponse | null | undefined} message */
    return function receive(message) {
        if (message?.type === "macroValidation") { receiveMacroValidation(message); return; }
        if (message?.type === "readProgress") {
            const model = getModel(), read = message.read;
            if (!model?.device?.connected || !model.load?.operationBusy || !read
                || read.operationId !== model.load?.operationId || read.phase !== model.load.phase
                || read.selectedDeviceId !== model.selectedDeviceId || read.connectionToken !== model.load.connectionToken
                || message.draftId !== model.draft?.id || message.draftRevision !== model.draft?.revision) return;
            const postApplyRead = model.postApplyRead && read.source === model.postApplyRead.step
                ? {...model.postApplyRead, progress: read.progress} : model.postApplyRead;
            setModel({...model, load: {...model.load, progress: read.progress}, postApplyRead,
                portable: read.source === "portable" ? {...model.portable, progress: read.progress} : model.portable});
            // This authored surface is an HTML container.
            const portableProgress = /** @type {HTMLElement | null} */ (root.querySelector(".profile-progress"));
            if (portableProgress && read.source === "portable") {
                portableProgress.hidden = !read.progress;
                if (portableProgress.lastElementChild) portableProgress.lastElementChild.textContent = typeof read.progress === "string" ? read.progress : "";
            }
            refreshCommitBar();
            const placeholder = root.querySelector(".read-placeholder > p");
            if (placeholder) placeholder.textContent = readScreen(getModel(), state.screen)?.detail || "";
            return;
        }
        if (message?.type === "applyProgress") {
            const model = getModel();
            if (!model) return;
            const draft = model.draft;
            if (!draft?.busy || message.draftId !== draft.id || message.draftRevision !== draft.revision
                || !message.apply || (model.apply && message.apply.id < model.apply.id)) return;
            setModel({...model, apply: message.apply});
            // A copy's byte counter must not rebuild its disabled editors. The
            // same main thread receives HID replies in the browser host.
            refreshCommitBar();
            return;
        }
        if (message?.type !== "model") return;
        const keepScreen = !["device", "profile"].includes(state.screen) && !state.overlay && !state.picker && !state.combo.awaiting
            && !message.resetDraftForms && !message.acceptedEdit && !message.notice
            && sameEditorContent(getModel(), message.model);
        setModel(message.model);
        // Leaving the demo goes back to where a keyboard is connected, or the demo
        // explored again; a screen of the demo's would only say it is unavailable.
        const demoNow = Boolean(message.model?.demo?.active);
        if (inDemo && !demoNow) state.screen = "keys";
        inDemo = demoNow;
        // A host that leaves the theme to the panel says which; otherwise the
        // host's own theme (VS Code's body class) holds.
        const theme = hostOf(message.model).theme;
        if (theme) document.documentElement.dataset.theme = theme;
        else delete document.documentElement.dataset.theme;
        // The host reports a refused edit as a notice prefixed "Failed"; that is a
        // failure, so it is shown as one rather than as a neutral message.
        if (message.notice) {
            const failed = /^Failed/.test(message.notice);
            state.error = failed ? message.notice : "";
            state.notice = failed ? "" : message.notice;
        }
        if (message.resetDraftForms) resetDraftForms();
        // A combo builder waiting on Keep or Delete closes when the host accepts
        // the edit, and stays open with its fields when the host refuses it. A
        // builder for a combo that no longer exists closes too.
        if (state.combo.awaiting) {
            if (/^Failed/.test(message.notice || "")) state.combo.awaiting = false;
            else closeComboBuilder();
        }
        if (state.combo.editId !== null && !(message.model?.combos || []).some((combo) => combo.id === state.combo.editId)) closeComboBuilder();
        const layerCount = message.model?.layers?.length || 0;
        if (state.layer >= layerCount) state.layer = 0;
        // A previewed set names layers by their place in the stack, so it is
        // dropped when the keyboard or the order under it changes.
        const stackKey = `${message.model?.device?.label || ""}|${message.model?.device?.connected ? 1 : 0}|${(message.model?.layers || []).map(layerName).join("\u0001")}`;
        if (stackKey !== lastStackKey) state.layersOn = [];
        lastStackKey = stackKey;
        const positions = message.model?.layers?.[state.layer]?.positions || [];
        if (!positions.some((position) => position.layoutIndex === state.selected)) {
            state.selected = positions[0]?.layoutIndex ?? 0;
        }
        if (state.overlay === "review" && !message.model?.draft?.dirty) state.overlay = null;
        if (state.overlay === "history" && !message.model?.draft) { state.overlay = null; post(control("closeProfileDraftHistory")); }
        if (state.overlay === "leaveDemo" && !message.model?.demo?.active) { state.overlay = null; state.leaveDemo = null; }
        render({keepScreen});
    };
}
