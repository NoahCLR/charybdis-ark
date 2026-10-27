import type {BaseIdentity, Behavior, BehaviorBranch, Combo, Colour, KeyFeedback, LayerReference, PointingSlot, Scalar} from './edits.js';
import type {ApplyView, Check, DemoView, HistoryStep, ShellPanel, LoadView, Participation, PhaseId, ProfileUsage, ReviewChange, SettingField, SettingsSection, Vocabulary} from './model.js';

export interface Position {
    layoutIndex: number;
    keycode: string;
    semantic?: string;
    display?: string;
    editLabel?: string;
    modifierLabel?: string;
    layerLabel?: string;
    row?: number;
    column?: number;
    value?: number;
}
/** One possible answer, while its layer is active and higher answering layers are absent. */
export interface LayerAnswer {layer: number; active: number; blocked: number}
export interface Layer {name: LayerReference; index: number; positions: Position[]; displayName?: string; answers: LayerAnswer[][]}
// What a key with no behaviour of its own runs on: its built-in actions, the
// timing defaults it follows, with or without a row, which setting each comes
// from, and whether a behaviour's timing alone does something on it (firmware
// D-F27 "Rows without steps").
export type TimingSource = "tappingTerm" | "tapHoldTerm" | "longHoldTerm" | "multiTapTerm";
export interface KeyBehaviorDefaults {
    builtIn: BuiltIn;
    timing: Record<string, Scalar | undefined>;
    timingSources?: Record<string, TimingSource>;
    timingAlone?: boolean;
}
export interface Branch extends BehaviorBranch { label?: string; fallback?: boolean; fromPress?: boolean}
export interface BuiltIn {tap?: Branch; hold?: Branch; releaseTaps?: boolean}
// A stored behaviour says whether it changes nothing (core/model/inert-behaviors.js).
export interface BehaviorView extends Omit<Behavior, 'steps'> {
    builtIn?: BuiltIn;
    steps: {tapCount: number; tapCountName?: string; tap?: Branch; hold?: Branch; longHold?: Branch}[];
    timingDefaults?: Record<string, Scalar | undefined>;
    timingWords?: Record<string, string>;
    changesNothing?: boolean;
}
export interface ComboView extends Combo {inputPositions?: number[]; id: number; badge: string; inputDisplays: string[]; outputDisplay: string}
export interface CatalogEntry {value: string; key: string; label: string; group: string; aliases: string[]; keycode: number; searchTerms: string[]; search: string; searchCompact: string; name?: string; tip?: string}
export interface MacroSlot {keycode: string; name: string; payload: string; protection: 'auto' | 'on' | 'off'; uninterruptible: boolean; needsUnicodeEntry: boolean; needsUnicodeSetup: boolean; playbackError: string; playbackCode: string; empty: boolean; bytes: number; playable: boolean; available: boolean; roomTaps: number}
/** A custom key's shortcut (firmware D-F26): a HID report modifier mask (bit 0 Left Ctrl … bit 7 Right GUI), its keys in press order (at most six, each once, at most one media and one system key), a mask of the layers it turns on, and how it turns them on (`layerKind`: 0 hold, 1 lock, 2 move to, 3 tap-toggle, 4 one-shot; 0 without layers). */
export interface CustomKeyShortcut {mods: number; keys: number[]; layers: number; layerKind: number}
/** A cap on a shortcut's keys: at most `most` of the keys in `keycodes` (every key when null), or, with `each`, each of them at most `most` times; `refusal` says why when broken. */
export interface ShortcutKeyCap {keycodes: readonly number[] | null; each: boolean; most: number; refusal: string}
/** A layer as a shortcut's layer: why a shortcut cannot turn it on ('' when it can), and which kind of always-on layer that makes it. */
export interface ShortcutLayerTarget {layer: number; refusal: string; alwaysOn: 'base' | 'default' | ''}
/**
 * A layer as a pointing slot's link target: `refusal` is why the keyboard would ignore a link to it, "" when it would not;
 * `inert` names the kind of layer the keyboard ignores in a link, for the editor's row; `linkedBy` is the slot whose mode the layer starts.
 */
/** A layer that starts a slot's mode as the keyboard runs its link, and the layers whose being on ends a start from it, bit n layer n (0: nothing does; core/model/pointing-links.js linkStarts). */
export interface PdLinkStart {layer: number; ends: number}
export interface PdLinkTarget {layer: number; refusal: string; inert: 'default' | 'pointer' | ''; linkedBy: number | null; linkedByName: string}
/** `shortcutLabel` names the shortcut in the host's words ("Left Ctrl + Right Alt + K"), empty for none. */
export interface CustomKey {
    slot: number; keycode: string; code: number; name: string; hasBehavior: boolean; shortcut: CustomKeyShortcut;
    /** The whole shortcut in words: modifiers, keys, then layers, joined by " + ", the layers led by their kind's verb unless held ("Lock Navigation"). */
    shortcutLabel: string;
    /** What it sends, one part each: modifiers in the host's words, then each key in press order; empty for layers alone. */
    shortcutKeys: string[];
    /** The layers it turns on, by name, lowest first; empty for none. */
    shortcutLayerNames: string[];
}
export type PresentedField = SettingField & {value: string; enabled?: boolean; ms?: string; whole?: string};
export interface PresentedSection extends Omit<SettingsSection, 'fields'> {fields: PresentedField[]}
export interface ProfileSummary {layers: number; behaviors: number; combos: number; macros: number; names: string[]}
/**
 * Why the open draft takes no edit now, or '' when it does, first match in this order: no draft; another
 * keyboard is selected; its keyboard is disconnected; it is connected over a new connection; the firmware
 * cannot hold a complete profile; the draft is stale; an operation is running.
 */
export type DraftBlock = '' | 'no-draft' | 'other-keyboard' | 'disconnected' | 'connection-changed' | 'unsupported' | 'stale' | 'busy';
export interface DraftView {
    id: string; revision: number; dirty: boolean; stale: boolean; connectionChanged: boolean; connected: boolean; matching: boolean; busy: boolean;
    /** Whether core takes an edit to this draft now (core/session/panel-session-state.js draftBinding); the interface's canEdit reads it. */
    editable: boolean;
    /** Why it does not, or '' when it does. */
    reason: DraftBlock;
    canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; historyLength: number; reviewed: boolean;
    changes: ReviewChange[]; checks: Check[]; steps?: HistoryStep[];
    /** Live modes: the keyboard runs unsaved edits; both halves hold the last one; the slave half refused it (the halves stay apart until Revert); what it says of its own saving. Null for a Review and save draft. */
    live: {unsaved: boolean; converged: boolean; slaveRefused: boolean; mode: number; keyboard: LiveKeyboardView | null} | null;
    /** What the keyboard says of itself in any edit mode (a Review and save draft's from the look between edits); null while it is not connected or has said nothing. */
    keyboard: LiveKeyboardView | null;
}
/** What a live keyboard says of its own saving and its halves (firmware D-F32). */
export interface LiveKeyboardView {
    adjustmentPending: boolean;
    saving: boolean; autoSaving: boolean;
    /** Nothing unsaved, and the keyboard saved it by itself. */
    savedByKeyboard: boolean;
    /** The last save of these edits failed; they are still unsaved. */
    saveFailed: boolean;
    /** A save waits for a quiet keyboard (no key held) on either half. */
    storagePaused: boolean;
    /** The master half stopped saving, or the slave half did: only a restart clears it (firmware D-F34). */
    stopped: boolean;
    slaveStopped: boolean;
    quietMs: number;
    /** How long Live edit waits before the keyboard saves, in words ("3 seconds"; core/model/vocabulary.js quietWords). */
    quietWords: string;
}
export interface LedGroup {name: string; id: number; ledIndices: number[]; expression: string; usageCount: number; usages: {target: string; owner: string}[]}
export interface LedRow {index: number; owner: string; color: Colour; ledGroup: string; ledGroupKind: string; ledIndices: number[]}
export interface RgbView {
    stageEnableMask: number;
    stages: {id: string; label: string; bit?: number; enabled: boolean}[];
    ledGroups: LedGroup[];
    layerColors: {layer: LayerReference; layerId: number; color: Colour; mode: string}[];
    layerLedGroups: LedRow[];
    automouseFade: {mode: string; end_color: Colour};
    pdModeColors: {pointingMode: string; color: Colour; locality: string}[];
    pdModeLedGroups: LedRow[];
    comboFeedback: {color: Colour; locality: string};
    comboFeedbackLedGroups: LedRow[];
    keyBehaviorFeedback: KeyFeedback<Colour>;
    keyBehaviorFeedbackLedGroups: LedRow[];
}
export interface BaseRgbView {state: string; message?: string; enabled?: boolean; effectId?: number; hue?: number; saturation?: number; brightness?: number; speed?: number; readAt?: string; effectName?: string; brightnessPercent?: number; previewColor?: Colour}
export interface PublishedModel {
    vocabulary: Vocabulary & {pickerModifiers: {bit: number; value: string; label: string}[]};
    layers: Layer[];
    hostLayoutLegends: Record<string, string[]> | null;
    /** `pointerCovers`: the layers the slot's key turns on that the pointer layer covers while the mode keeps it, bit n layer n (core/model/pointing-links.js). */
    pdModes: (PointingSlot & {displayName: string; keys: {slot: number; hold: string; lock: string; holdCode: number; lockCode: number}; pointerCovers: number; linkStarts: PdLinkStart[]})[];
    pdModeEditing: {writable: boolean; dpiChoices: {value: number; label: string}[]; tapKeys: {plain: string[]; modified: string[]};
        /** Every layer as a link target (core/model/pointing-links.js): why the keyboard would ignore it in a link ("" when it would not), and the slot whose link names it. */
        linkTargets: PdLinkTarget[];
        /** The pointer layer, which names what covers a slot's `pointerCovers`. */
        pointerLayer: number | null};
    keyBehaviors: BehaviorView[];
    behaviorEditing: {busy: boolean; writable: boolean; maxTapStepsPerBehavior: number; keyDefaults: Record<string, KeyBehaviorDefaults>};
    profileIdentity: Partial<BaseIdentity> | null;
    rgb: Partial<RgbView> & {maximumBrightness?: number; baseEffect: BaseRgbView};
    combos: ComboView[];
    comboReadback: {layerReferences?: number[]; version?: number; state?: string; writable?: boolean; defaultTermMs?: number; holdTermMs?: number; enabled?: boolean; error?: {message?: string}};
    macros: MacroSlot[];
    macroNameSpace: {perName: number} | null;
    macroBank: {capacity: number; stored: number; free: number; available: number; slots: number; reserveTaps: number} | null;
    hostSettings: {selected: number; detected: number; effective: number; unicodeEnabled: boolean; unicodeMode: number; layout: number; layoutFits: boolean; macosIso: boolean} | null;
    macroUnicode: {mode: number; enabled?: boolean; os?: number; layout?: number; layoutFits?: boolean; layoutName?: string; layoutChars?: string};
    macroProtectionChoices: {value: 'auto' | 'on' | 'off'; label: string}[];
    macroEditing: {identity: string; writable: boolean};
    behaviorTimingDefaults: Record<string, string>;
    configDefaults: PresentedSection[];
    participation: Participation | null;
    settingsEditing: {identity: string; writable: boolean};
    macroPayloadKeycodes: string[];
    macroPayloadModifierKeycodes: string[];
    customKeys: CustomKey[];
    customKeyNameSpace: {perName: number} | null;
    /** The keys a custom key's shortcut may hold, by catalogue name and alias. */
    customKeyShortcutKeys: string[];
    /** The caps on a shortcut's keys, in the order the codec checks them, each with the codec's words when broken, and the limits in words (core/schema/settings-domain-v1.js, SHORTCUT_KEY_LIMITS). */
    customKeyShortcutKeyLimits: {caps: ShortcutKeyCap[]; words: string};
    /** Every layer with why a custom key's shortcut cannot turn it on (core/model/shortcut-layers.js). */
    customKeyShortcutLayers: ShortcutLayerTarget[];
    customKeyEditing: {identity: string; writable: boolean};
    /** The keyboard's own name: '' for the firmware's built-in one, which `builtIn` gives when the shell knows it. */
    keyboardName: {name: string; builtIn: string; identity: string; perName: number} | null;
    qmkKeycodes: CatalogEntry[];
    qmkKeyLabels: Record<string, string>;
    /** Keycode name → the layer it acts on, beside its label in qmkKeyLabels (model/key-names.js keyLayer). */
    qmkKeyLayers: Record<string, number>;
    /** The layers each keycode turns on as the key pressed, bit n layer n, by every name it is read under; a keycode that turns none on is absent (core/model/layer-reach.js keycodeLayersOn). */
    qmkKeyTurnsOn: Record<string, number>;
    qmkKeyShortLabels: Record<string, string>;
    qmkKeycodeAliases: Record<string, string>;
    qmkKeycodeSource: string;
    /** QMK spellings the encoder accepts beyond the catalogue: mod-tap shorthands (name → MT modifiers), deprecated wrappers (name → wrapper) and names (name → expression). */
    qmkSpellings: {modTaps: Record<string, string>; wrappers: Record<string, string>; names: Record<string, string>};
    diagnostics: string[];
    /** `summary` names the saved profile's generation and digest (Diagnostics); `savedProfile` the same in words, without the digest. */
    device: {connected: boolean; label: string; summary: string; savedProfile: string; subtitle: string; /** Each half's flash pauses as last read (GET 0x0D); null until read; the demo's are samples. */ flashPauses: import('./model.js').FlashPausesView | null; health: {profile: string; converged: boolean; halves: import('./model.js').HalvesId; recoveryPending: boolean; restartNeeded: boolean; earlierFormat: boolean; busy: boolean; phase: PhaseId; error: string}};
    devices: {id: string; label: string}[];
    selectedDeviceId: string;
    draft?: DraftView;
    demo: DemoView;
    apply: ApplyView | null;
    /** Core always sets `progress`, possibly undefined, which a JSON transport drops. */
    postApplyRead: {step: import('./messages.js').ReadStep; progress?: import('./model.js').CountedProgress | null} | null;
    portable: {available: boolean; busy: boolean; progress?: string; review: {incoming: ProfileSummary; current?: ProfileSummary | null; fileName: string | null; differences: import('./model.js').ReviewSummary[] | null; /** The file's profile bytes against this keyboard's memory. */ fits?: {used: number; capacity: number} | null} | null; layers: {key: string; order: number[]; names: string[]; keysFollow: boolean} | null; usage: ProfileUsage | null; /** When the copy from before the last Apply on this keyboard was saved; Put back what it had uses it. */ putBack: string | null};
    shell: ShellPanel;
    load: LoadView;
    /** A renamed keyboard that disconnected to take its new name, which the panel waits to see again. */
    /** Waiting for the keyboard to come back: renamed by a save, or `lost`. */
    reconnecting: {name: string; lost: boolean; /** Ark restarted it (firmware D-F34). */ restart?: boolean} | null;
    /** What the connected firmware reports about itself; null with no keyboard read. */
    firmware: import('./model.js').FirmwareView | null;
    /** How edits reach this keyboard (stored on it): 0 Review and save, 1 Live edit, 2 Live preview + save; the modes Ark offers. Null without a keyboard. */
    editMode: {mode: number; conflict: boolean; offered: number[]; /** A half could not store the mode yet (retrying): a replug now may lose it. */ notStored: boolean} | null;
    /** A live edit waiting for the person to confirm the traps or warnings it adds. */
    liveProposal: {id: number; label: string | null; checks: import('./model.js').Check[]} | null;
    /** Ark's own live edit or Revert, held by the keyboard until no key is held: what to do, what holds it, and whether Cancel edit is offered (never for a Revert). */
    liveWait: {title: string; detail: string; cancellable: boolean} | null;
    /** Toggles a key turned off over a stored "on": shown as turned off by key, never as a change. */
    runtime: {combosOffByKey: boolean; behavioursOffByKey: boolean} | null;
}
