// @ts-check
"use strict";
const {evaluateProfileCompatibility, evaluateLiveMutationCompatibility} = require("./firmware-support");
const {editorViews} = require("../model/profile-model");
const {storedKeyboardName} = require("../model/keyboard-name");
const {layerName} = require("../model/vocabulary");
const {cloneStatus} = require("./candidate-status");
const {publicError} = require("./operation-failure");
const {CANDIDATE_STATE_NAMES} = require("../protocol/profile-candidate-v1");

/**
 * @typedef {import("./types.js").DeviceConnection} Connection
 * @typedef {import("./types.js").DeviceCapabilities} Caps
 * @typedef {import("./types.js").ReadSnapshot} ReadSnapshot
 * @typedef {import("./types.js").RestoredProfile} Restored
 * @typedef {import("../protocol/types.js").EditModeRead} EditModeRead
 * @typedef {Omit<Extract<import("./types.js").ComboRead, {state: "read"}>, "state" | "readAt">} CombosSaid
 * @typedef {Omit<Extract<import("./types.js").BaseRgbRead, {state: "read"}>, "state" | "readAt">} BaseRgbSaid
 */

/**
 * What a keyboard says of itself, kept as said (`Held.keep`); the combos and
 * the background effect are stamped as read when kept.
 * @typedef {{
 *   capabilities?: Caps,
 *   status?: import("./types.js").ProfileStatus,
 *   candidateStatus?: import("./types.js").CandidateStatus,
 *   runtime?: import("../protocol/types.js").RuntimeRead | null,
 *   flashPauses?: import("../../contracts/model.js").FlashPausesView,
 *   layout?: import("./types.js").LayoutRead,
 *   committed?: import("./types.js").CommittedRead,
 *   combos?: CombosSaid,
 *   baseRgb?: BaseRgbSaid,
 *   lastRefreshedAt?: string,
 * }} Said
 */

/**
 * What happened to the edit mode (`Held.mode`): read, set (which says whether
 * its write is still owed), failed to read, absent until read, seen by a
 * live read, or its write said owed or not.
 * @typedef {{read: EditModeRead} | {set: EditModeRead & {notStored: boolean}} | {failed: unknown} | {absent: true} | {seen: number} | {notStored: boolean}} ModeEvent
 */

// The keys `keep` takes. The profile the editors follow is adopted
// (`adopt`), and the edit mode follows its own events (`mode`).
const SAID = new Set(["capabilities", "status", "candidateStatus", "runtime", "flashPauses", "layout", "committed", "combos", "baseRgb", "lastRefreshedAt"]);

// Each read as it starts (`reading`).
const READING = {
    layout: () => ({state: /** @type {const} */ ("reading"), progress: {done: 0, total: 0}, layers: /** @type {[]} */ ([]), readAt: ""}),
    committed: () => ({state: /** @type {const} */ ("reading"), progress: {done: 0, total: 0}}),
    combos: () => ({state: /** @type {const} */ ("reading")}),
    baseRgb: () => ({state: /** @type {const} */ ("reading")}),
};

// What the service holds of one connection, and the only writer of it: each
// operation is given the one held when it starts (`ConnectionState.of`).
// What the keyboard says is kept only while this is the connection held and
// it is connected (`current`); once the state is cleared, a writer from the
// connection that ended writes into nothing anyone publishes.
class Held {
    /** @type {ConnectionState} */
    #state;
    /** @type {Connection | undefined} */
    #connection;
    #publicId = "";
    /** @type {number | null} */
    #token = null;
    /** @type {import("../protocol/types.js").RequestIds | undefined} */
    #requestIds;
    // What the keyboard said, and what Ark keeps of it for the editors.
    /** @type {Omit<Said, "combos" | "baseRgb"> & {lastRefreshedAt: string, runtime: import("../protocol/types.js").RuntimeRead | null,
     *   combos?: import("./types.js").ComboRead, baseRgb?: import("./types.js").BaseRgbRead, portableProgress: string,
     *   portable?: ReadSnapshot | Restored, views?: ReturnType<typeof editorViews>}} */
    #facts = {lastRefreshedAt: "", runtime: null, portableProgress: ""};
    // How edits reach this keyboard (firmware D-F32), read with its
    // capabilities; undefined when the keyboard does not say, or when it
    // could not be read (`editModeUnknown`, tried again at the next status
    // refresh or read).
    /** @type {(EditModeRead & {notStored?: boolean}) | undefined} */
    #editMode = undefined;
    #editModeUnknown = false;

    // Plain on purpose, each with one writer and no rule: the apply's step
    // view (the device service), and the live watch's looks left unanswered
    // in a row (background-reads.js).
    /** @type {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} */
    liveApply = {state: "idle"};
    missedLooks = 0;

    /** @param {ConnectionState} state @param {{connection: Connection, publicId: string, token: number, requestIds: import("../protocol/types.js").RequestIds}} [opened] */
    constructor(state, opened) {
        this.#state = state;
        if (!opened) return;
        this.#connection = opened.connection;
        this.#publicId = opened.publicId;
        this.#token = opened.token;
        this.#requestIds = opened.requestIds;
    }

    get connection() {return this.#connection;}
    get connected() {return Boolean(this.#connection?.connected);}
    get connectionPublicId() {return this.#publicId;}
    get connectionToken() {return this.#token;}
    get requestIds() {return this.#requestIds;}
    get capabilities() {return this.#facts.capabilities;}
    get status() {return this.#facts.status;}
    get portable() {return this.#facts.portable;}
    get editMode() {return this.#editMode;}
    get editModeUnknown() {return this.#editModeUnknown;}

    // Whether this is still the connection held, and connected.
    get current() {return this.#state.of() === this && this.connected;}

    // Keeps what the keyboard just said; false, keeping nothing, once it is
    // not current. New capabilities rebuild the editors' views.
    /** @param {Said} said */
    keep(said) {
        for (const key of Object.keys(said)) if (!SAID.has(key)) throw new TypeError(`ConnectionState keeps no ${key} as said; ${key === "portable" ? "adopt it" : key === "editMode" ? "give it as a mode event" : "it is not the keyboard's"}.`);
        if (!this.current) return false;
        const {combos, baseRgb, ...rest} = said, facts = this.#facts, readAt = new Date().toISOString();
        Object.assign(facts, rest);
        if ("combos" in said) facts.combos = combos && {state: "read", ...combos, readAt};
        if ("baseRgb" in said) facts.baseRgb = baseRgb && {state: "read", ...baseRgb, readAt};
        if ("capabilities" in said && facts.portable) facts.views = editorViews(facts.portable, facts.capabilities);
        return true;
    }

    // The profile the editors follow, with their views (profile-model.js);
    // false, adopting nothing, once it is not current.
    /** @param {ReadSnapshot | Restored} profile */
    adopt(profile) {
        if (!this.current) return false;
        this.#facts.portable = profile;
        this.#facts.views = editorViews(profile, this.#facts.capabilities);
        return true;
    }

    // A read starts.
    /** @param {keyof typeof READING} part */
    reading(part) {this.#facts[part] = READING[part]();}

    // How far the layout's or the committed profile's read has come.
    /** @param {"layout" | "committed"} part @param {import("../../contracts/model.js").CountedProgress} progress */
    progress(part, progress) {
        const facts = this.#facts;
        if (part === "layout") facts.layout = {...facts.layout, progress};
        else facts.committed = {...facts.committed, progress};
    }

    // The words a complete read, Apply or Save shows while it runs (`end`
    // clears them).
    /** @param {string} words */
    showing(words) {this.#facts.portableProgress = words;}

    // A read failed: unavailable, with why, while this connection is
    // connected; cleared once it is lost; and nothing once another is held.
    // True only when kept as unavailable.
    /** @param {"layout" | "combos" | "baseRgb"} part @param {unknown} error */
    failed(part, error) {
        if (this.#state.of() !== this) return false;
        const facts = this.#facts;
        if (!this.connected) {
            facts[part] = undefined;
            return false;
        }
        const failure = {state: /** @type {const} */ ("unavailable"), error: publicError(error)};
        if (part === "layout") facts.layout = {...failure, layers: [], progress: null};
        else facts[part] = failure;
        return true;
    }

    // What happened to the edit mode. A read that does not say whether the
    // keyboard still owes the mode's write (a set does) keeps what was last
    // said of it. A firmware without an edit mode (UNHANDLED) has none; any
    // other failure leaves it unknown, which implies none. Seen live or said
    // owed, it changes nothing without an edit mode. Resolves whether what is
    // published changed; nothing changes once it is not current.
    /** @param {ModeEvent} event */
    mode(event) {
        if (!this.current) return false;
        const before = JSON.stringify(this.#editMode ?? null);
        if ("read" in event) this.#known({...event.read, notStored: this.#editMode?.notStored ?? false});
        else if ("set" in event) this.#known(event.set);
        else if ("absent" in event) this.#known(undefined);
        else if ("failed" in event) {
            this.#editMode = undefined;
            this.#editModeUnknown = /** @type {{code?: string} | undefined} */ (event.failed)?.code !== "UNHANDLED";
        } else if (!this.#editMode) return false;
        else if ("seen" in event) this.#editMode = {...this.#editMode, mode: event.seen};
        else this.#editMode = {...this.#editMode, notStored: event.notStored};
        return JSON.stringify(this.#editMode ?? null) !== before;
    }

    /** @param {(EditModeRead & {notStored?: boolean}) | undefined} mode */
    #known(mode) {
        this.#editMode = mode;
        this.#editModeUnknown = false;
    }

    // The operation that was given this ended: the words it showed go.
    end() {this.#facts.portableProgress = "";}

    // This connection's part of the service's `snapshot()`, with its
    // compatibility judged now.
    published() {
        const facts = this.#facts, {capabilities, status, committed, portable, views} = facts, connected = this.connected;
        const compatibility = capabilities ? evaluateProfileCompatibility(capabilities) : null;
        return {
            connected,
            selectedDeviceId: this.#publicId,
            connectionToken: this.#token,
            capabilities: capabilities ? {...capabilities} : null,
            status: status ? {...status} : null,
            candidateStatus: facts.candidateStatus ? publishedCandidateStatus(facts.candidateStatus) : null,
            compatibility,
            mutationCompatibility: evaluateLiveMutationCompatibility(capabilities, compatibility, connected, status),
            storedKeyboardName: storedKeyboardName(portable) ?? committed?.domains?.settings?.keyboardName,
            portableSummary: committed?.domains?.settings ? {names: committed.domains.settings.names.map((name, index, names) => layerName(names, index))} : portable?.summary || null,
            portableProgress: facts.portableProgress || "",
            settingsView: views?.settingsView ? clone(views.settingsView) : null,
            macroView: views?.macroView ? clone(views.macroView) : null,
            customKeyView: views?.customKeyView ? clone(views.customKeyView) : null,
            liveApply: publishedLiveApply(this.liveApply),
            layout: facts.layout ? clone(facts.layout) : null,
            committed: committed ? clone(committed) : null,
            baseRgb: facts.baseRgb ? clone(facts.baseRgb) : null,
            combos: facts.combos ? clone(facts.combos) : null,
            flashPauses: facts.flashPauses ? clone(facts.flashPauses) : null,
            editMode: this.#editMode ? {...this.#editMode} : null,
            runtime: facts.runtime ? clone(facts.runtime) : null,
            lastRefreshedAt: facts.lastRefreshedAt,
        };
    }
}

// What the device service holds of the connection (profile-device-service.js):
// the keyboard as the service last saw it, from its capabilities to the
// profile the editors follow. A connection is opened into it and listened
// to until detached; it ends with the connection, cleared as one (`clear`),
// and is published as the connection's part of the service's `snapshot()`
// (`published`), every part a copy, so the panel can keep it while the
// service goes on. It is written only through the writer held for the
// connection (`of`, a `Held`); what the service reads of it is read-only.
class ConnectionState {
    #held = new Held(this);
    /** @type {(() => void) | undefined} */
    #stopListening = undefined;

    // Holds `connection`, and hears its loss (`onLoss`) until detached.
    // Refused while another is held.
    /** @param {Connection} connection @param {{publicId: string, token: number, requestIds: import("../protocol/types.js").RequestIds, onLoss: (reason: unknown) => void}} opened */
    open(connection, {publicId, token, requestIds, onLoss}) {
        if (this.#held.connection) throw new Error("A connection is already held: clear it before opening another.");
        this.#held = new Held(this, {connection, publicId, token, requestIds});
        this.#stopListening = /** @type {(() => void) | undefined} */ (connection.onDisconnect(onLoss));
    }

    // Stops hearing the connection's loss, as one closing it does.
    detach() {
        this.#stopListening?.();
        this.#stopListening = undefined;
    }

    // The connection ended: stop listening to it, and hold nothing of it.
    clear() {
        this.detach();
        this.#held = new Held(this);
    }

    // The writer for the connection held now.
    of() {return this.#held;}

    get connection() {return this.#held.connection;}
    get connected() {return this.#held.connected;}
    get connectionPublicId() {return this.#held.connectionPublicId;}
    get connectionToken() {return this.#held.connectionToken;}
    get requestIds() {return this.#held.requestIds;}
    get capabilities() {return this.#held.capabilities;}
    get portable() {return this.#held.portable;}
    get editMode() {return this.#held.editMode;}

    published() {return this.#held.published();}
}

/** @param {NonNullable<import("./types.js").DeviceModelInput["liveApply"]>} value */
function publishedLiveApply(value) {
    return value && value.state !== "idle" ? clone(value) : {state: /** @type {const} */ ("idle")};
}

// A candidate status with its state's name, an unknown state's included.
/** @param {import("./types.js").CandidateStatus} status */
const publishedCandidateStatus = status => ({...cloneStatus(status), stateName: candidateStateName(status.state)});

/** @param {number} state */
function candidateStateName(state) {
    return CANDIDATE_STATE_NAMES[state] || `UNKNOWN_${state}`;
}

// A JSON copy, which shares nothing with what the service holds.
/** @template T @param {T} value @returns {T} */
function clone(value) {return JSON.parse(JSON.stringify(value));}

module.exports = {ConnectionState, Held, clone};
