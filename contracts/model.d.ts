import type {AccentTable, AutocorrectFeedbackColourField, Scalar, Tier, TimingTerm} from './edits.js';
// A global switch: one a banner names (vocabulary.settingOff), and whose
// runtime override a switch key turns off for now (offByKey).
export type SettingOffSwitch = 'behaviour' | 'combo' | 'autoMouse' | 'autocorrect';
export type {AccentTable};

/** The setting a behaviour timing's default comes from: the dual-role tapping term or a behaviour default. */
export type TimingSource = 'tappingTerm' | TimingTerm;
/** A macro step's kind (glossary "Macro step"). */
export type MacroStepKind = 'text' | 'tap' | 'delay' | 'press' | 'release';
/** What a profile holds that the keyboard counts against a limit (core/model/profile-usage.js). */
export type UsageCountId = 'behaviours' | 'behaviourSteps' | 'combos' | 'lightingGroups' | 'lightingGroupRows' | 'macros' | 'autocorrectInputs' | 'customKeys' | 'pointingModes';

/** Device operation identity is stable when presentation words change. */
export type PhaseId = 'idle' | 'available' | 'empty' | 'connected' | 'demo' | 'enumerate' | 'connect' | 'refresh' | 'starting' | 'read-layout' | 'read-profile' | 'read-complete' | 'restore-complete' | 'disconnect' | 'read-combos' | 'read-base-rgb' | 'live-edit' | 'live-save' | 'live-revert' | 'edit-mode' | 'restart';
export type EditModeId = 'apply' | 'live' | 'liveReview';
/** How edits reach the keyboard, as it stores it (core/protocol/profile-edit-v1.js EDIT_MODE): 0 Review and save, 1 Live edit, 2 Live preview + save. */
export type EditMode = 0 | 1 | 2;
export interface PhaseWords {label: string; read?: string; busy?: string; writes: boolean}

export interface CountedProgress {done: number; total: number}
export interface BuildInfo {version: string; commit: string}
/** What made a recovery copy: an Apply, an Import restore, a Save, a restart, or leaving Live edit. */
export type RecoveryCause = 'apply' | 'restore' | 'save' | 'restart' | 'leave-live';
/** `cause` and `keyboard` are absent on copies stored before they were recorded. */
export interface RecoveryCopy {id: string | number; name: string; savedAt: string; cause?: RecoveryCause; keyboard?: string}
export interface ShellPanel {
    chooseKeyboard: boolean;
    blocked: {title: string; detail: string; demo?: boolean} | null;
    theme: 'light' | 'dark';
    recoveries: RecoveryCopy[];
    build: BuildInfo | null;
    progress: string | null;
    words: Record<string, string>;
}
export interface DemoView {
    active: boolean;
    offered: boolean;
    name: string | null;
    fileName: string | null;
    unsaved: boolean;
    applyNeedsKeyboard: string;
}
export interface LoadView {
    state: 'loading' | 'ready' | 'unavailable';
    /** Unavailable, though the read did not fail: why the open draft holds editing (core/session/panel-session-state.js draftBinding). */
    held?: import('./panel.js').DraftBlock;
    phase: PhaseId;
    operationId?: number;
    operationBusy?: boolean;
    connectionToken?: number | string | null;
    progress?: CountedProgress | string | null;
}
export interface StatusModel {
    vocabulary?: Pick<Vocabulary, 'phases'> & Partial<Pick<Vocabulary, 'halves' | 'firmwareUpdate' | 'draftBlocks'>>;
    load?: LoadView;
    device?: {connected?: boolean; health?: {error?: string; phase?: PhaseId; halves?: HalvesId}};
    shell?: ShellPanel;
    demo?: DemoView;
    portable?: {available?: boolean; progress?: CountedProgress | string | null};
    draft?: {changes?: readonly unknown[]; live?: unknown};
}

/** The steps of one Apply, in order (core/session/apply-progress.js APPLY_STEPS). */
export type ApplyStep = 'check' | 'backup' | 'upload' | 'validate' | 'slave' | 'commit' | 'converge' | 'verify';
/** `saved`: "none" nothing was saved; "decided" the keyboard decided to save and finishes by itself; "unknown". */
/** `verdict` is the sentence for `saved` (core/session/interruption.js APPLY_VERDICTS) that every notice about this Apply starts with. */
/** `advice`: what to do next, as whole sentences, for an Apply cut short; empty otherwise. Its notice is `verdict`, `reason` and these, joined. */
export interface ApplyFailure {step: ApplyStep; label: string; reason: string; saved: string; verdict: string; advice: string[]}
/** What the connected firmware reports about itself (core/session/firmware-support.js firmwareView). */
export interface FirmwareView {
    version: string | null; versionWord: string | null; defaultsDigest: string | null;
    worksWithArk: boolean; readable: boolean;
    layers: number | null; tapCounts: number | null; behaviours: number | null; combos: number | null; keysPerCombo: number | null;
    macros: number | null; macroBytes: number | null; customKeys: number | null; leds: number | null; profileBytes: number | null; repeatHz: number;
}
/** One half's flash pauses as it reports them (GET 0x0D, firmware D-F29): µs from boot, verbatim. `physicalHalf` is 0 left, 1 right, 0xFF not provisioned. */
export interface FlashPauseFigures {
    physicalHalf: number;
    longestEraseUs: number; longestProgramUs: number; longestStorageStepUs: number;
    lastSaveUs: number; lastSaveFlashUs: number; saves: number;
}
/** Both halves' flash pauses as last read: a half with no figures yet is null. */
export type FlashPausesView =
    | {state: 'read'; master: FlashPauseFigures | null; slave: FlashPauseFigures | null}
    | {state: 'unavailable'; error: string};
export interface ApplyView {
    id: number;
    state: 'failed' | 'done' | 'applying';
    steps: {id: ApplyStep; label: string; state: 'failed' | 'done' | 'active' | 'pending'}[];
    current: ApplyStep;
    detail: string;
    bytes: {completed: number; total: number} | null;
    failure: ApplyFailure | null;
}

export type WordList<T = Scalar> = readonly (readonly [T, string])[];
export type HalvesId = 'agree' | 'alone' | 'apart' | 'unread';
/** A Lighting field the tabs and the review both name. */
export type LightingField = 'colour' | 'locality' | 'paintMode' | 'fadeMode' | 'endColour' | 'tapBranchCommit';

export interface Vocabulary {
    phases: Readonly<Record<PhaseId, Readonly<PhaseWords>>>;
    readSteps: Readonly<Record<import('./messages.js').ReadStep, string>>;
    editModes: Readonly<Record<EditMode, Readonly<{id: EditModeId; label: string; hint: string; detail: string}>>>;
    halves: Readonly<Record<HalvesId, Readonly<{label: string; detail: string}>>>;
    /** Why nothing can be edited on a keyboard whose firmware Ark does not support (D-L64). */
    firmwareUpdate: string;
    /** Why the open draft takes no edit, by the reason core publishes (D-L60): what a control says, and the title and detail a screen shows; a live draft's detail where it differs. */
    draftBlocks: Readonly<Partial<Record<import('./panel.js').DraftBlock, Readonly<{sentence: string; title: string; detail: string; liveDetail?: string}>>>>;
    pickerModifiers?: {bit: number; value: string; label: string}[];
    /** The key a host layout's third level is typed with: "Option" or "AltGr". */
    thirdLevel?: string;
    hostOs: WordList<number>;
    physicalHalves: WordList<number>;
    macroPlayback?: Readonly<Record<string, string>>;
    macroProtection: WordList<'auto' | 'on' | 'off'>;
    /** The setting macroProtection chooses, by its name, and Automatic as it says whether it plays uninterruptibly now ("Automatic · on"). */
    macroUninterruptible: Readonly<{label: string; automatic: Readonly<{on: string; off: string}>}>;
    macroSteps: WordList<MacroStepKind>;
    /** What a text replacement is, text or a macro, as its editor's choice and its tag say it. */
    replacementKinds: WordList<'text' | 'macro'>;
    /** How a replacement fires (D-L91): as you type, after the Leader key, or both; the switch on its editor and its tag in the bank. */
    inputModes: WordList<'word' | 'leader' | 'both'>;
    /** The Leader key's name, on its cap before Try it's After Leader field and where the editor says the key is placed. */
    leaderKey: string;
    /** The formats a text replacement list is saved in, by extension, in the order Export offers them. */
    listFileFormats: WordList<import('./messages.js').AutocorrectFileFormat>;
    /** A step's short name under its tile and in the legend: a key or chord step says which it is. */
    macroStepTiles: Readonly<Record<Exclude<MacroStepKind, 'tap'> | 'key' | 'chord', string>>;
    /** Why a macro does not read in the step editor, by the macro grammar's reason code (rules/macro-payload.mjs). */
    macroProblems: Readonly<Record<string, string>>;
    hostLayouts: WordList<number>;
    /** How macro text types what its layout cannot, by the Unicode mode it plays with. */
    unicodeEntry: WordList<number>;
    unicodeEntryOff: WordList<number>;
    holdStyles: {hold: WordList<string>; long: WordList<string>};
    holdWithoutLongHold: WordList<string>;
    tapSends: string;
    holdFromPress: string;
    timingSources: Readonly<Record<TimingSource, string>>;
    thresholds: Readonly<Record<TimingTerm, string>>;
    /** A threshold as a field or a note names it ("tap / hold threshold"). */
    thresholdNames: Readonly<Record<TimingTerm, string>>;
    /** What a threshold means, as its field's hover help says. */
    thresholdTips: Readonly<Record<TimingTerm, string>>;
    tiers: Readonly<Record<Tier, string>>;
    /** What lands a press in each tier, as the grid's heading says on hover. */
    tierTips: Readonly<Record<Tier, string>>;
    branches: readonly string[];
    localities: WordList<string>;
    paintModes: WordList<string>;
    paintModesBrief: WordList<string>;
    /** The localities in a word or two, for a list's cell. */
    localitiesBrief: WordList<string>;
    fadeModes: WordList<string>;
    tapCommit: WordList<string>;
    /** Lighting's fields, as its tabs label them and the review names them. */
    lightingFields: Readonly<Record<LightingField, string>>;
    /** The colour editor's choice: a colour, or off (D-L95). */
    colourChoice: {colour: string; off: string};
    /** What storing HSV(0, 0, 0) does, by lighting stage: its choice's tip and the note once stored, and, for a colour an owner has (D-L94), what that choice and the colour then read (Passthrough), and the Off choice's tip and note; `offAction` names the choice where HSV(0, 0, 0) is off (D-L95). */
    colourOff: Readonly<Record<string, {offTip: string; offNote?: string; offAction?: string; offWord?: string; ledsOffTip?: string; ledsOffNote?: string}>>;
    feedbackOwners: WordList<string>;
    /** The behaviour tier each behaviour state flashes for, by its RGB_KEY_SEMANTICS name; the others have none. */
    feedbackTiers: Readonly<Partial<Record<string, Tier>>>;
    /** Accents by the table an accent edit names (D-L77): when they light, `{owner}` standing for the owner picked; the owner that is all of a table's, by its RGB enum name, where it has one, and what all of its owners are called; what an accent that takes its stage's colour takes. */
    accents: Readonly<Record<AccentTable, {when: string; everyOwner?: string; every: string; stageColour: string;
        /** An owner that stands for some of the table's owners (Every tap branch, D-L93): its RGB enum name, what it is called, and the owners it stands for. */
        group?: {owner: string; words: string; members: readonly string[]}}>>;
    /** The accent editor's own fields. */
    accentFields: {lightsFor: string; ownColour: string};
    /** The case (an RGB_KEY_SEMANTICS name) each Behaviour feedback row shows, by the row: a tier's colour field or `branch:<n>`. */
    feedbackColourOwners: Readonly<Record<import('./edits.js').FeedbackRow, string>>;
    /** What Replacement feedback shows, by its RGB_AUTOCORRECT_SEMANTICS name: each case, and all of them. */
    replacementOwners: WordList<string>;
    /** When each Replacement feedback case shows, by its RGB_AUTOCORRECT_SEMANTICS name. */
    replacementWhen: Readonly<Record<string, string>>;
    /** The case (an RGB_AUTOCORRECT_SEMANTICS name) each Replacement feedback colour shows, by the colour's field. */
    replacementColourOwners: Readonly<Record<AutocorrectFeedbackColourField, string>>;
    /** The groups of Lighting's lists beside an editor. */
    lightingLists: {inUse: string; tiers: {title: string; tip: string}; tapBranches: {title: string; tip: string}; replacements: {title: string; tip: string}; comboFeedback: {title: string; empty: string; tip: string}; holdLayer: {title: string; empty: string; tip: string}};
    stages: readonly {id: string; label: string; short: string; bit?: number}[];
    customKeys: {alwaysOn: {base: string; default: string}; layerKinds: WordList<number>};
    /** A layer key's second line on its cap, by its QMK function (MO, TG…). */
    keyCapLayerVerbs: Readonly<Record<string, string>>;
    /** What each layer key does to its layer, in the words its name reads by ("Hold", "Lock"), by its form; LT and LM have none. */
    layerKeyVerbs: Readonly<Partial<Record<LayerForm, string>>>;
    /** The keyboard's switch keys for behaviours (BH_ON, BH_OFF, BH_TOGG) and auto-mouse (AM_ON, AM_OFF, AM_TOGG), in words, by name; QMK's for combos are worded by its catalogue. */
    switchKeys: Readonly<Record<string, string>>;
    checkLevels: Readonly<Record<FindingLevel, string>>;
    checkStatuses: Readonly<Record<Check['status'], string>>;
    recoveryCauses: Readonly<Record<RecoveryCause, string>>;
    /** Each settings section's heading, by section id. */
    settingsSections: Readonly<Record<string, string>>;
    /** A profile file's settings sections as Import's summary names them, by section id. */
    fileSections: Readonly<Record<string, string>>;
    /** Why a behaviour or a key toward a combo does not take part, by reason; a layer's or a key's name follows the words of `layer`, `layers` and `placement`. */
    participationReasons: Readonly<Record<'behavior' | 'combo', Readonly<Record<ParticipationReason, string>>>>;
    participationPlaces: Readonly<{key: string; layer: string; keyOn: string}>;
    /** A Settings screen as a link or a pointer to it names it, by screen id. */
    settingsScreens: Readonly<Record<'behaviours' | 'combos' | 'pointer' | 'host', string>>;
    /** Each usage count's name and what it counts. */
    usageCounts: Readonly<Record<UsageCountId, {label: string; what: string}>>;
    pointing: {
        kinds: WordList<number>;
        directions: WordList<string>;
        diagonals: WordList<string>;
        axes: WordList<number>;
        invert: WordList<number>;
        scrollAxes: WordList<number>;
        pointerLayer: WordList<number>;
        linkLabels: {startsOther: string; linkedLayers: string; linkTurnsOn: string; linkEnds: string; startedBy: string; endsWhen: string; keyTurnsOnShort: string; ignored: string; started: string};
        linkInert: {default: string; pointer: string};
        linkEnds: WordList<number>;
        emptyDirection: WordList<number>;
        directionOutput: WordList<number>;
        directionStep: WordList<number>;
        modifierPolicy: WordList<number>;
        kindsDo: WordList<number>;
        movementLabel: string;
        scrollFields: WordList<string>;
        heldModifiers: string;
        tips: Readonly<Record<string, string>>;
        pointerLayerLabel: string;
        /** The editor's other field labels, which the review names its fields by. */
        fieldLabels: Readonly<Record<'name' | 'dpi' | 'axis' | 'emptyDirection' | 'directionOutput' | 'scrollAxes' | 'invert' | 'horizontal' | 'vertical', string>>;
    };
    modifiers: WordList<number>;
    comboOptions: Readonly<Record<string, string>>;
    /** What a behaviour and a combo share: whether it runs, and on which layers. */
    definitionFields: {use: Readonly<Record<'behaviour' | 'combo', string>>; allowedLayers: string; offInSettings: Readonly<Record<'behaviour' | 'combo', string>>; onceOn: Readonly<Record<'behaviour' | 'combo', string>>};
    settingOff: {switches: Readonly<Record<SettingOffSwitch, {off: string; fix: string; /** What off means where the banner is, when it says so. */ detail?: string}>>; stage: string;
        /** Text replacement off with a leader input on the list (D-L91): what off means on its screen and on the Replacement feedback tab. */ leading: {list: string; stage: string}};
    behaviourFields: Readonly<Record<'anchor' | 'timings', string>>;
    comboFields: Readonly<Record<'inputs' | 'sends' | 'window' | 'conditions', string>>;
}

export type MacroTypingRoute =
    | {character: string; method: 'layout'; strokes: string[]}
    | {character: string; method: 'unicode' | 'unavailable'; mode: number};
export interface MacroInspection {
    bytes: number | null;
    availableBytes: number;
    error: string;
    code: string;
    typing: MacroTypingRoute[];
}

export type FindingLevel = 'blocker' | 'trap' | 'warning' | 'notice';
export type FindingPlace =
    | {kind: 'key'; layer: number; layoutIndex?: number}
    | {kind: 'behaviour'; keycode: string}
    | {kind: 'combo'; index: number}
    | {kind: 'pointing'; slot: number}
    /** `keycode`: the slot's name, as the Macros screen picks it. */
    | {kind: 'macro'; index: number; keycode: string}
    /** A text replacement entry, by its id in the draft's list (the keyboard's, for one the draft removed): its replacement's text, or a macro replacement's key. */
    | {kind: 'autocorrect'; entry: string}
    | {kind: 'settings'; area?: string; section?: string; stage?: string};
export interface Finding {
    kind: string;
    level: FindingLevel;
    layers: number[];
    identity?: string;
    title: string;
    detail: string;
    fix: string;
    place?: FindingPlace;
    count?: number;
    path?: string[];
    scope?: 'escapes' | 'reachability';
}
export interface Check extends Finding {key: string; status: 'new' | 'existing' | 'fixed'}
export interface ProfileUsage {
    used: number;
    capacity: number;
    /** `unavailable`: free slots the keyboard cannot use right now (macro slots macro memory has no room for); `fixed`: a set of slots the keyboard always has all of. */
    counts: {id: UsageCountId; used: number; limit: number; unavailable?: number; /** A fixed set of slots, always all there. */ fixed?: true}[];
    source?: 'draft' | 'keyboard' | 'demo';
}

/** Profile-specific names sent to every surface that displays a key. */
export interface ProfileKeyNames {
    labels: Record<string, string>;
    aliases: Record<string, string>;
    pointing: NamedKey[];
    custom: NamedKey[];
    hostOs: number;
    legends: Record<string, string[]> | null;
    layers: string[];
    /** Keycode name → the layer it acts on, for every layer key named here. */
    keyLayers: Record<string, number>;
    /** Keycode name → what it does to that layer, by QMK's function. */
    keyLayerForms: Record<string, LayerForm>;
}
/** What a layer key does to its layer, by QMK's function (and LOCK_LAYER, this keyboard's lock). */
export type LayerForm = 'MO' | 'TG' | 'TO' | 'TT' | 'OSL' | 'DF' | 'PDF' | 'LT' | 'LM' | 'LOCK_LAYER';
/** What a keycode is, where the interface treats it apart from other keys (core/model/key-names.js keyKind). */
export type KeyKind = 'transparent' | 'disabled' | 'macro' | 'customKey';
export interface NamedKey {name: string; native: string; code: number; label: string}

export type ReviewPlace = FindingPlace
    | {kind: 'layers'; layers?: number[]}
    /** A bank's order: the slots a swap moved, by the name each screen picks them by (D-L81). */
    | {kind: 'slots'; bank: 'macros'; keycodes: string[]}
    | {kind: 'slots'; bank: 'customKeys'; keycodes: string[]}
    | {kind: 'slots'; bank: 'pdModes'; slots: number[]}
    /** `keycode`: the key's name, as the Custom keys screen picks it. */
    | {kind: 'customKey'; index: number; keycode: string}
    | {kind: 'lighting'; stage?: string | null; layer?: number; slot?: number};
export interface ReviewChange {
    area: string;
    unit: string | null;
    title: string;
    status: 'added' | 'changed' | 'removed';
    note?: string;
    group?: number | null;
    groupTitle?: string | null;
    place?: ReviewPlace | null;
    titleMark?: ReviewMark;
    fields: ReviewField[];
}
/** Import review omits full field comparisons and behavior targets. */
export type ReviewSummaryPlace = Exclude<ReviewPlace, {kind: 'behaviour'}> | {kind: 'behaviour'};
export type ReviewSummary = Pick<ReviewChange, 'unit' | 'title' | 'status'> & {place?: ReviewSummaryPlace | null};

export type ReviewMark =
    | {kind: 'layer'; layer: number}
    /** A set of layers, each named as the value names it, in order. */
    | {kind: 'layers'; layers: {layer: number; name: string}[]}
    | {kind: 'pointing'; slot: number}
    /** A macro or a custom key, which has a mark but no colour (D-L31). */
    | {kind: 'macro'}
    | {kind: 'customKey'}
    | {kind: 'tier'; tier: string; branch?: number}
    /** Every tap count from 2× up, as the Multi tap window governs them. */
    | {kind: 'branches'}
    | {kind: 'combo'; badge?: string}
    | {kind: 'stage'; on: boolean};
export interface ReviewField {
    label: string;
    status?: ReviewChange['status'];
    before: Scalar | null;
    after: Scalar | null;
    labelMark?: ReviewMark;
    beforeMark?: ReviewMark;
    afterMark?: ReviewMark;
    beforeColour?: import('./edits.js').Hsv;
    afterColour?: import('./edits.js').Hsv;
}
export interface HistoryStep {
    step: number;
    at: number;
    label: string;
    current: boolean;
    undone: boolean;
    changes: ReviewChange[] | null;
}
/** Why a behaviour, or a key toward a combo, does not take part: the master switch, the layer's switch, the definition's own switch, the layers it runs on, the placement's switch (core/model/participation.js). */
export type ParticipationReason = 'master' | 'layer' | 'definition' | 'layers' | 'placement';
export interface Participation {
    comboOutputBehaviors?: boolean;
    behaviorsEnabled: boolean;
    /** Per layer: why no behaviour, or no combo, runs on it at all, and the keys whose Use behaviour or Join combos is off there, by layout index. */
    layers: {behaviors: ParticipationReason[]; combos: ParticipationReason[]; bypass: number[]; exclude: number[]}[];
}

export interface SettingBits {bitMask?: number; shift?: number; width?: number; kind?: string}
export interface SettingFieldBase extends SettingBits {
    tooltip?: string;
    macro: string;
    label: string;
    hint?: string;
    unit?: string;
    presentation?: 'duration';
    validate?: string;
    min?: number;
    max?: number;
    choices?: (number | {value: number; label?: string})[];
    readOnly?: boolean;
    /** The firmware was built without it: it does nothing, whatever it reads. */
    notBuilt?: boolean;
    /** QMK owns the live value, so keys on the keyboard (or VIA) change it too. */
    keyboardKeys?: boolean;
    /** The global switch this field is, whose runtime override a switch key turns off for now (the published `offByKey`). */
    offSwitch?: SettingOffSwitch;
    governs?: {kind: 'tier'; tier: string} | {kind: 'branches'} | {kind: 'layer'; layer: number};
    /** The heading a field is listed under within its section. */
    part?: string;
}
export interface StoredSettingField extends SettingFieldBase {
    header?: undefined;
    id: number;
    kind: 'number' | 'toggle' | 'layer';
    record?: undefined;
    layer?: undefined;
    of?: undefined;
}
export interface ShareSettingField extends SettingFieldBase {
    header?: undefined;
    id: number;
    kind: 'share';
    of: number;
    record?: undefined;
    layer?: undefined;
}
export interface LayerSettingField extends SettingFieldBase {
    header?: undefined;
    id?: undefined;
    kind: 'layer';
    record: 'reference';
    layer: number;
    of?: undefined;
}
export interface HeaderSettingField extends SettingFieldBase {
    header: 'comboOutputBehaviors';
    id?: undefined;
    kind: 'toggle';
    record?: undefined;
    layer?: undefined;
    of?: undefined;
}
export type SettingField = StoredSettingField | ShareSettingField | LayerSettingField | HeaderSettingField;
export interface ComboTimingField {id: 'default' | 'hold'; label: string; hint: string}
export interface SettingsSection {
    id: string;
    label: string;
    /** The review area the section is listed under: Settings, Mouse or Lighting. */
    area?: string;
    stage?: string;
    description?: string;
    warning?: string;
    githubLink?: {label: string; url: string};
    /** The words for the section's one-per-layer switches, shown together as one row of layers. */
    layerGroup?: {label: string; hint: string};
    fields: SettingField[];
    comboTiming?: readonly ComboTimingField[];
}
