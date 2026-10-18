// @ts-check
"use strict";
const {PHASE} = require("../model/vocabulary");

// The panel's side of a session: what extension.js used to decide inline.
//
// A panel session is a plain object the host keeps per window — the device
// service, the draft, the layer editor, and the outbox the next model carries
// (a notice, an accepted edit, a request to reset forms). Whether its draft
// may be edited, and the changes that move several of its fields at once, are
// panel-session-state.js's. Everything here is
// free of VS Code, so it is tested like the rest of core/; panel-loop.js runs
// it for every host, and extension.js keeps only VS Code's dialogs, files and
// progress.

/**
 * @typedef {import("./types.js").PanelSession} Session
 * @typedef {import("./types.js").PanelModelSession} ModelSession
 * @typedef {import("./types.js").PanelDeviceState} State
 * @typedef {import("./types.js").LayerEditState} LayerEdit
 * @typedef {import("../model/types.js").CompleteSnapshot} Snapshot
 */
const {fingerprint, summary, reorderLayers} = require("../model/portable-profile");
const {profileReview} = require("../model/profile-review");
const {profileUsage} = require("../model/profile-usage");
const {canEdit, firmwareView} = require("./firmware-support");
const {ProfileDraftSession, DRAFT_EDITS} = require("./profile-draft-session");
const {buildDeviceModel, buildSnapshotModel, deviceLabels} = require("./device-model");
const {demoDiagnostics, demoHeader, demoModel} = require("./demo-session");
const {assertBound, beginRead, boundDraft, closeEditors, draftBinding, replaceDraft, setDraft} = require("./panel-session-state");

const {controlsOn, panelControl} = require("./panel-control-registry");
const {RECONNECT_WORDS} = require("./keyboard-reconnect");
// Retained exports for hosts that inspect the routes; never hand-maintained.
const DRAFT_CONTROLS = controlsOn("draft");
const PORTABLE_MESSAGES = controlsOn("portable");
const DEMO_MESSAGES = controlsOn("demo");
// The routes that start work, which wait for the current operation.
const WORK_ROUTES = new Set(["draft", "portable", "demo", "read"]);
const BUSY_REFUSAL = "Wait for the current operation to finish before starting another.";

// What the panel says and offers that depends on its host, published as
// `model.host`, so the panel never asks which host it is in. A host passes
// `words` that differ from these, and `panel()` for what it offers now:
//
//   chooseKeyboard   the panel offers Choose keyboard, which opens the host's picker
//   blocked          {title, detail}: why this host cannot reach a keyboard at all
//   theme            "light" or "dark" when the panel offers its own theme toggle
//   recoveries       [{id, name, savedAt}]: recovery copies the panel lists, each downloadable
//   build            {version, commit} the host was built from
//   progress         what the host is doing, where it has no indicator of its own
//
// A session without a host (the preview, tests) describes the extension's.
const HOST_WORDS = Object.freeze({
    noKeyboard: "No keyboard is connected. Connect one and choose Read keyboard.",
    connectHint: "Connect a Charybdis, then read it to begin editing.",
});
/** @param {import("./types.js").PanelHost | null | undefined} host @returns {import("../../contracts/model.js").HostPanel} */
function hostModel(host) {
    const offered = host?.panel?.() || {};
    return {
        chooseKeyboard: Boolean(offered.chooseKeyboard),
        blocked: offered.blocked || null,
        theme: offered.theme === "light" || offered.theme === "dark" ? offered.theme : null,
        recoveries: Array.isArray(offered.recoveries) ? offered.recoveries : null,
        build: offered.build || null,
        progress: offered.progress || null,
        words: {...HOST_WORDS, ...host?.words},
    };
}

// A complete read of a supported keyboard opens the draft, or refreshes the
// one already open against what the keyboard now holds.
/** @param {ModelSession} session @param {State} state @param {import("../model/types.js").ProfileSnapshot | null | undefined} [portable] */
function observePortable(session, state, portable = session.service.portable) {
    if (session.draft && !session.draft.dirty && state.connected && (state.selectedDeviceId !== session.draft.deviceId || !canEdit(state.capabilities))) {
        setDraft(session, undefined);
    }
    if (!portable || portable === session.observedPortable || !state.connected || !canEdit(state.capabilities)) return;
    if (portable.incomplete && !session.draft) return;
    if (!session.draft) setDraft(session, new ProfileDraftSession(portable, state.selectedDeviceId, state.capabilities, state.connectionToken));
    else session.draft.observe(portable, state.selectedDeviceId, state.connectionToken, state.capabilities);
    session.observedPortable = portable;
}

// A service notification advances the draft lifecycle explicitly. Rendering
// the same state again is only a projection and cannot perform this step.
/** @param {ModelSession} session @param {State} state */
function observeService(session, state) {
    if (!session.demo) observePortable(session, state);
    if (session.draft && state.connected && state.selectedDeviceId === session.draft.deviceId) session.draft.noteConnection(state.connectionToken ?? null);
}

/** @param {Session} session @param {State} state @param {Snapshot | undefined} snapshot */
function discardDraftForDevice(session, state, snapshot) {
    replaceDraft(session, canEdit(state.capabilities)
        ? new ProfileDraftSession(/** @type {Snapshot} */ (snapshot), state.selectedDeviceId, state.capabilities, state.connectionToken)
        : undefined);
}

// The model the webview renders. With a draft open, the editable surfaces come
// from the draft, while the device header and diagnostics stay the keyboard's
// own: the rail describes the keyboard, not the draft. In the demo, `state` is
// the demo's (demo-session.js panelState), and the header says demo: no
// keyboard is read, so none is described.
/** @param {ModelSession} session @param {State} state @returns {ReturnType<typeof buildDeviceModel> & import("./types.js").PanelModelExtras} */
function buildPanelModel(session, state) {
    const device = state.devices?.find((entry) => entry.id === state.selectedDeviceId);
    const busy = Boolean(state.busy || session.portableBusy || session.readBusy);
    const supported = canEdit(state.capabilities);
    const binding = draftBinding(session, state);
    const actual = {...state, busy, device};
    const model = session.draft && supported && state.selectedDeviceId === session.draft.deviceId
        ? buildSnapshotModel(session.draft.current, session.draft.capabilities, binding, actual)
        : buildDeviceModel(actual);
    // The connected keyboard is called by the name it stores once that is
    // read, so a new name shows as soon as it is applied, before the keyboard
    // reconnects under it.
    const stored = state.connected ? state.storedKeyboardName : "";
    const listed = state.devices || [];
    const labels = deviceLabels(listed.map((entry) => ({...entry, product: entry.product || entry.label, name: entry.id === state.selectedDeviceId && stored ? stored : ""})));
    const devices = listed.map(({id}, index) => ({id, label: labels[index]}));
    const selectedDeviceId = state.selectedDeviceId || "";
    /** @type {import("./types.js").PanelDraftView | undefined} */
    let draft;
    if (session.draft) {
        const view = session.draft.view(state);
        draft = {...view, matching: view.matching && supported, connected: view.connected && supported, busy, editable: binding.editable, reason: binding.reason};
        if (session.historyOpen) draft.steps = session.draft.steps();
        if (draft.matching) {
            model.profileIdentity = session.draft.identity();
        }
        if (draft.dirty && draft.matching) model.device.subtitle = "Showing your local draft · the keyboard still runs the last applied profile";
    }
    // The last Apply's steps: live while it runs, kept when it failed. A
    // successful one lasts only until its readback ends, so a later busy
    // operation is not drawn as reading back an Apply.
    if (session.demo) {
        model.device = demoHeader({demo: session.demo}, busy);
        model.diagnostics = demoDiagnostics({demo: session.demo});
    }
    const demo = demoModel(session, state);
    const live = state.liveApply;
    const apply = live && (live.state === "applying" || live.state === "failed" || (live.state === "done" && session.applyRunning)) ? live : null;
    const postApplyRead = session.postApplyReadStep ? {
        step: session.postApplyReadStep,
        progress: session.postApplyReadStep === "layout" ? state.layout?.progress
            : session.postApplyReadStep === "profile" ? state.committed?.progress : null,
    } : null;
    /** @type {import("./types.js").PanelModelExtras["portable"]} */
    const portable = {
        available: Boolean(state.connected && canEdit(state.capabilities)),
        busy,
        progress: state.portableProgress,
        review: session.portableReview ? {incoming: summary(session.portableReview.document), current: session.portableReview.before.summary,
            fileName: session.portableReview.fileName || null, differences: importDifferences({...session, portableReview: session.portableReview}),
            fits: fileFits(session.portableReview.document, state.capabilities)} : null,
        layers: session.portableLayers ? {key: session.portableLayers.before.fingerprint, order: session.portableLayers.order, names: session.portableLayers.names, keysFollow: session.portableLayers.keysFollow !== false} : null,
        usage: usageOf(session, state, draft),
        putBack: session.beforeApply && session.beforeApply.deviceId === state.selectedDeviceId ? session.beforeApply.savedAt : null,
    };
    if (!draft?.matching) model.layers?.forEach((layer, index) => {layer.displayName = state.portableSummary?.names[index] || layer.name;});
    // A read is ready while its draft could be edited once whatever runs now
    // finishes, so an Apply's readback keeps the editor shown.
    const editableDraft = binding.editable || binding.reason === "busy";
    const readReady = (session.readReady ?? editableDraft) && editableDraft;
    const host = hostModel(session.host);
    // A renamed keyboard that has gone to take its new name is coming back:
    // the panel waits for it as for a read, rather than asking to connect one.
    const reconnecting = session.reconnect && !state.connected ? {name: session.reconnect.name} : null;
    /** @type {import("../../contracts/model.js").LoadView} */
    const load = {
        state: session.readBusy || reconnecting ? "loading" : readReady ? "ready" : "unavailable",
        phase: state.phase || PHASE.IDLE,
        operationId: state.operationId,
        operationBusy: Boolean(state.busy),
        connectionToken: state.connectionToken,
        progress: reconnecting && !session.readBusy ? RECONNECT_WORDS.waiting : state.portableProgress || state.layout?.progress || state.committed?.progress || null,
    };
    // What the firmware says about itself and its ceilings (Keyboard, Settings).
    const firmware = firmwareView(state.capabilities);
    return {...model, devices, selectedDeviceId, ...(draft ? {draft} : {}), demo, apply, postApplyRead, portable, host, load, reconnecting, firmware};
}

// How full the profile is: the draft's, when one is open for this keyboard,
// otherwise what the keyboard runs. Nothing without a connected keyboard. In
// the demo, an unedited draft is the demo setup.
/** @param {ModelSession} session @param {State} state @param {import("./types.js").PanelDraftView | undefined} draft @returns {import("../../contracts/model.js").ProfileUsage | null} */
function usageOf(session, state, draft) {
    if (!state.connected) return null;
    const fromDraft = Boolean(session.draft && draft?.matching);
    const usage = profileUsage(fromDraft && session.draft ? session.draft.current : session.service?.portable, state.capabilities || undefined);
    return usage && {...usage, source: fromDraft && session.draft?.dirty ? "draft" : session.demo ? "demo" : "keyboard"};
}

// Whether a chosen file fits this keyboard's profile memory.
/** @param {import("../model/types.js").PortableDocument} document @param {State["capabilities"]} capabilities */
function fileFits(document, capabilities) {
    try {
        const usage = profileUsage({document, fingerprint: fingerprint(document), summary: summary(document)}, capabilities || undefined);
        return usage ? {used: usage.used, capacity: usage.capacity} : null;
    } catch {
        return null;
    }
}

// A chosen profile file against what the keyboard holds, not the draft: that
// is what applying it would write. Each difference is its unit, what happened
// to it and where it is edited, for the import card to count by category;
// its fields wait for the draft's own review. Nothing, when the keyboard holds an interrupted
// configuration there is no comparing with. Kept with the review, for the
// keyboard it was made against.
/** @param {ModelSession & {portableReview: import("./types.js").PortableReview}} session */
function importDifferences(session) {
    const review = session.portableReview, keyboard = session.draft ? session.draft.baseSnapshot : review.before;
    if (!keyboard || keyboard.incomplete) return null;
    if (review.differences?.against !== keyboard.fingerprint) {
        const file = {...keyboard, document: review.document, decoded: undefined, fingerprint: fingerprint(review.document)};
        /** @param {import("../model/types.js").ModelReviewPlace} place */
        const where = (place) => {
            if (place.kind !== "behaviour") return place;
            const {target, ...location} = place;
            return location;
        };
        return profileReview(keyboard, file).map((item) => ({unit: item.unit, title: item.title,
            status: item.status, place: item.place ? where(item.place) : null}));
    }
    return review.differences.items;
}

// What the panel posted, as the loop takes it: an object naming its type.
// Anything else is no request, answered like an unrecognised one. Only the
// envelope is checked here; each route checks the payload fields it reads
// (the draft's decoders, applyLayerEdit, the macro inspection).
/** @param {unknown} value @returns {import("../../contracts/messages.js").PanelRequest | null} */
function panelRequest(value) {
    if (typeof value !== "object" || value === null || !("type" in value) || typeof value.type !== "string") return null;
    return /** @type {import("../../contracts/messages.js").PanelRequest} */ (value);
}

/**
 * Where a message from the webview goes. Draft edits are staged here, since
 * staging is synchronous; everything else names the handler the host runs:
 * "draft" (review, undo, apply…), "portable" (backups, layers), "read", or
 * "none" for a message that only needs an answer. Every refusal throws, and
 * the host turns it into a notice.
 */
/** @param {Session} session @param {import("./types.js").PanelMessage | null | undefined} message @param {State} state */
function routeMessage(session, message, state) {
    if (!message) return "none";
    const type = message.type, control = panelControl(type);
    // The draft history sheet is only a view: while it is open the model
    // carries every step, and only then, since that is the whole history.
    if (control?.route === "view") {
        session.historyOpen = control.action === "openHistory";
        return "none";
    }
    // Nothing starts while a read or backup runs, and a request that would is
    // refused out loud (panel-loop.js). A webview that loads again only asks
    // for the model, and host controls start nothing here, so both are answered.
    if (session.portableBusy || session.readBusy) {
        if (type === "ready" || !(DRAFT_EDITS.has(type) || WORK_ROUTES.has(control?.route || ""))) return "none";
        throw new Error(BUSY_REFUSAL);
    }
    if (control?.route === "demo") return "demo";
    // A panel that loads again in the demo stays in it; reading a keyboard
    // leaves it first (panel-loop.js), so nothing reads one from here.
    if (session.demo && control?.route === "read") return "none";
    if (session.draft && (DRAFT_EDITS.has(type) || control?.identity) && message.draftId !== session.draft.id) {
        throw new Error("This edit belongs to an older draft. Read the keyboard before continuing.");
    }
    if (DRAFT_EDITS.has(type)) {
        // Every change leaves this window through a reviewed draft. Without one
        // (a keyboard whose profile could not be read, or firmware that is not
        // current) the app is read-only; an edit that reaches here is refused,
        // never written.
        if (!session.draft) {
            throw new Error("This keyboard has no editable draft, so the change was not written. Read the keyboard again; if it stays read-only, update both halves to current firmware.");
        }
        const draft = boundDraft(session, state, message, "Reconnect the keyboard this draft belongs to and wait for its current operation.");
        // The command set selects the decoder; stage validates payload values.
        session.acceptedEdit = draft.stage(/** @type {import("./types.js").DraftEdit} */ (message));
        return "staged";
    }
    // Apply writes the draft to the keyboard it is bound to, by the same rule
    // as an edit; the draft checks its revision, review and keyboard again as
    // it writes (ProfileDraftSession.apply).
    if (control?.binding === "apply" && session.draft) {
        assertBound(session, state, (reason) => reason === "connection-changed" ? "Review this draft against the connected keyboard before applying it."
            : "Reconnect the keyboard this draft belongs to and wait for its current operation before applying it.");
    }
    if (control?.route === "draft") return "draft";
    if (control?.binding === "import") boundDraft(session, state, message, "Read the keyboard and wait for its current operation before importing a profile.");
    // A file chooser and the layer editor can also open or keep a review
    // against the draft. Recovery with no editable draft remains available.
    if (session.draft && control?.binding === "profile") {
        assertBound(session, state, "Read the keyboard and wait for its current operation before changing this profile.");
        session.draft.assertRevision(session.draft.revision);
    }
    if (control?.route === "portable") return "portable";
    if (control?.route === "read") {
        const {deviceId} = /** @type {import("./types.js").PanelEnvelope} */ (message);
        if (state.busy) {
            if (type === "ready") return "none";
            throw new Error(BUSY_REFUSAL);
        }
        if (control.action === "select" && (!state.devices?.some((device) => device.id === deviceId) || !deviceId)) {
            throw new Error("Choose a keyboard from the current device list.");
        }
        if (control.action === "select" && deviceId !== state.selectedDeviceId) closeEditors(session, {resetForms: true});
        beginRead(session);
        return "read";
    }
    return "none";
}

// ── Rename & Reorder: names and order, staged as one layer-reference rewrite ──

// keysFollow: whether moving a layer renumbers the layer keys that reach it
// (the default), or leaves them reaching whatever layer takes its place.
/** @param {Snapshot} before @param {number | undefined} revision @returns {LayerEdit} */
function startLayerEdit(before, revision) {
    return {before, revision, order: Array.from({length: before.summary.layers}, (_, id) => id), names: [...before.summary.names], keysFollow: true};
}

// The edit's document, rewritten with its order and these names (one per layer
// as it was read). Rewriting is how a name is checked: one the document cannot
// store is refused here, before it is kept.
/** @param {LayerEdit} edit @param {readonly string[]} names */
const rewriteLayers = (edit, names) => reorderLayers(edit.before.document, edit.order, edit.order.map((old) => names[old]), {keysFollow: edit.keysFollow});

/** @param {LayerEdit} edit @param {readonly string[]} names */
function keepNames(edit, names) {
    rewriteLayers(edit, names);
    edit.names = [...names];
}

// A move or a toggle posts every name the form holds, which is only taken
// when it is one string per layer; anything else is ignored, not refused.
/** @param {LayerEdit} edit @param {unknown} names @returns {names is string[]} */
const postsEveryName = (edit, names) => Array.isArray(names) && names.length === edit.names.length && names.every((name) => typeof name === "string");

// Applies one message from the Rename & Reorder panel to its local state. A name
// is checked by rewriting the document with it, so an invalid one is refused
// before it is kept.
/** @param {LayerEdit | null | undefined} edit @param {import("./types.js").LayerEditMessage} message */
function applyLayerEdit(edit, message) {
    if (!edit) throw new Error("Read the layers again before editing them.");
    if (message.keysFollow !== undefined) {
        if (typeof message.keysFollow !== "boolean") throw new Error("Read the layers again before editing them.");
        edit.keysFollow = message.keysFollow;
        if (message.type === "editPortableLayer" && message.id === undefined) {
            // The form posts every name with the toggle, as with a move.
            if (postsEveryName(edit, message.names)) keepNames(edit, message.names);
            return edit;
        }
    }
    if (message.type === "savePortableLayers" && message.names !== undefined) {
        if (!Array.isArray(message.names) || message.names.length !== edit.names.length) throw new Error("Read the layers again before naming them.");
        keepNames(edit, message.names);
        return edit;
    }
    const id = message.id;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id >= edit.order.length) throw new Error("Read the layers again before editing them.");
    if (message.name !== undefined) {
        if (typeof message.name !== "string") throw new Error("Enter a layer name.");
        const names = [...edit.names];
        names[id] = message.name;
        keepNames(edit, names);
        return edit;
    }
    // The form posts every name with the move, because the rows are rebuilt
    // from this state afterwards: dropping them here would quietly undo
    // whatever was typed before the move.
    if (postsEveryName(edit, message.names)) keepNames(edit, message.names);
    // The bottom slot is the base. A layer reaches it only through Make base,
    // which swaps it with the layer there; a move or a drag stays above it.
    const from = edit.order.indexOf(id);
    if (message.makeBase === true) {
        if (from < 1) throw new Error("That layer is already the base.");
        [edit.order[0], edit.order[from]] = [edit.order[from], edit.order[0]];
        return edit;
    }
    const to = typeof message.to === "number" && Number.isInteger(message.to) ? message.to : typeof message.direction === "number" && Number.isInteger(message.direction) && [1, -1].includes(message.direction) ? from + message.direction : NaN;
    if (from < 1 || !(to >= 1 && to < edit.order.length)) throw new Error("The base stays at the bottom; use Make base to put another layer there.");
    edit.order.splice(to, 0, ...edit.order.splice(from, 1));
    return edit;
}

/** @param {LayerEdit} edit */
const layerEditDocument = (edit) => rewriteLayers(edit, edit.names);

module.exports = {DEMO_MESSAGES, DRAFT_CONTROLS, HOST_WORDS, PORTABLE_MESSAGES, applyLayerEdit, buildPanelModel, hostModel, discardDraftForDevice, layerEditDocument, observePortable, observeService, panelRequest, routeMessage, startLayerEdit};
