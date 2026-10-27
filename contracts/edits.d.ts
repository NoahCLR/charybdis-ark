/** Posted values are editor values; the core validates and converts them to wire values. */
export type LayerReference = `Layer ${number}`;
export type Scalar = string | number;
export interface Hsv {h: number; s: number; v: number}
export interface Colour {h?: Scalar; s?: Scalar; v?: Scalar}
export interface BaseIdentity {source: string; generation: number; digest: Scalar; originHalf: Scalar}
export interface DraftIdentity {draftId: string; draftRevision: number}
export type Tier = 'tap' | 'hold' | 'long';
export type HoldStyle = 'PRESS_AND_HOLD_UNTIL_RELEASE' | 'TAP_AT_HOLD_THRESHOLD' | 'TAP_ON_RELEASE_AFTER_HOLD' | 'REPEAT_WHILE_HELD';
export type BranchStyle = HoldStyle | 'TAP_SENDS';
export interface BehaviorBranch {style?: BranchStyle; action: string; repeatHz?: Scalar}
export interface BehaviorStep {tapCount: number; tap?: BehaviorBranch; hold?: BehaviorBranch; longHold?: BehaviorBranch}
export interface Behavior {
    keycode: string;
    steps: BehaviorStep[];
    tapHoldTerm?: Scalar;
    longHoldTerm?: Scalar;
    multiTapTerm?: Scalar;
    keepsAutoMouseAnchored?: boolean;
    enabled?: boolean;
    allowedLayers?: number;
    // Editor-only, never posted: whether the row is stored, and whether a
    // timing alone does something on its key (firmware D-F27).
    stored?: boolean;
    timingAlone?: boolean;
}
export interface Combo {
    useOutputBehavior?: boolean;
    output: string;
    inputs: string[];
    termMs?: Scalar | null;
    followsDefault?: boolean;
    holdTermMs?: Scalar;
    mustHold?: boolean;
    mustTap?: boolean;
    ordered?: boolean;
    enabled?: boolean;
    allowedLayers?: number;
}
export interface KeyFeedback<C = Hsv> {
    tapBranchColors: C[];
    tapCommittedColor: C;
    holdActiveColor: C;
    longHoldActiveColor: C;
    tapCommitMode?: string;
    locality?: string;
}
export type FeedbackColourField = 'tapCommittedColor' | 'holdActiveColor' | 'longHoldActiveColor';
export type FeedbackRow = FeedbackColourField | `branch:${number}`;
export interface PdTap {keycode: Scalar; modifierPolicy: number; mask: number}
export type Direction = 'left' | 'right' | 'up' | 'down';
export type Diagonal = 'upLeft' | 'upRight' | 'downLeft' | 'downRight';
export interface PdConfig {
    id: number;
    kind: number;
    name: string;
    dpi: number;
    pointerLayer: number;
    /** The linked layers (firmware D-F62), bit n layer n: the layers that start the mode. */
    linkedLayers: number;
    /** The layers the mode's key turns on while it runs the mode, bit n layer n, any mix. */
    linkTurnsOn: number;
    /** What ends a mode its linked layers started: 0 nothing, 1 a higher layer, 2 any other layer. Needs linked layers. */
    linkEnds: number;
    axis?: number;
    heldModifiers?: number;
    thresholdX?: number;
    thresholdY?: number;
    directions?: Record<string, PdTap>;
    diagonals?: Record<string, PdTap>;
    emptyDirection?: number;
    directionOutput?: number;
    scroll?: Record<string, number>;
}
export interface SettingEdit {macro: string; enabled?: boolean; value?: Scalar | boolean}

export interface EditPayloads {
    reviewPortableProfile: {text: string; name: string};
    updateLayoutKeys: {layer: LayerReference; changes: {layoutIndex: number; keycode: string}[]};
    updatePlacementPolicy: {layer: number; layoutIndex: number; useBehavior: boolean; joinCombos: boolean};
    deleteBehavior: {expectedBase?: Partial<BaseIdentity>; keycode: string};
    retargetBehavior: {expectedBase?: Partial<BaseIdentity>; keycode: string; target: string; conflict?: 'swap' | 'overwrite'};
    saveBehavior: {expectedBase?: Partial<BaseIdentity>; behavior: Behavior};
    addCombo: Combo;
    saveCombo: Combo & {id: number};
    deleteCombo: {id: number};
    updateComboHoldTerm: {holdTermMs: Scalar; expectedBase?: Partial<BaseIdentity>};
    updateComboDefaultWindow: {defaultTermMs: Scalar; expectedBase?: Partial<BaseIdentity>};
    updateRgbStages: {stageEnableMask: number};
    updateLayerColor: Hsv & {layer: LayerReference; mode: string};
    updateAutomouseFade: Hsv & {mode: string};
    updatePdModeColor: Hsv & {pointingMode: string; locality: string};
    updateComboFeedback: Hsv & {locality: string};
    updateKeyBehaviorFeedback: {config: KeyFeedback};
    addRgbLedGroup: {group: Hsv & {target: string; owner?: string; ledGroupName?: string; ledIndices?: number[]}};
    deleteRgbLedGroup: {target: string; index: number};
    saveRgbReusableLedGroup: {group: {ledIndices: number[]; originalName?: string}};
    deleteRgbReusableLedGroup: {name: string};
    updateMacro: {keycode: string; expectedFingerprint?: string} & (
        {payload: string; name?: string; protection?: 'auto' | 'on' | 'off'}
        | {name: string; payload?: string; protection?: 'auto' | 'on' | 'off'}
        | {protection: 'auto' | 'on' | 'off'; payload?: string; name?: string}
    );
    validateMacro: {keycode: string; payload: string; requestId: number};
    updateCustomKey: {keycode: string; name: string; expectedFingerprint?: string};
    /**
     * A custom key's shortcut (firmware D-F26): a HID report modifier mask, up to six keys held together in the order they are pressed
     * (each once, at most one media and one system key), its layers and the layer kind they act as
     * (0 Hold, 1 Lock, 2 Move to, 3 Tap-toggle, 4 One-shot; 0 without layers), `{mods: 0, keys: [], layers: 0, layerKind: 0}` to clear it.
     * `name` names the key in the same step. `then` is a layout or profile edit staged on top in the same draft step
     * (a layout key, a behaviour cell, a combo kept with it as its output): what the keycode picker offers for
     * modifiers no keycode can hold (D-L63).
     */
    updateCustomKeyShortcut: {keycode: string; shortcut: import('./panel.js').CustomKeyShortcut; name?: string; then?: Extract<PanelEdit, {type: 'updateLayoutKeys' | 'saveBehavior' | 'addCombo' | 'saveCombo'}>; expectedFingerprint?: string};
    renameKeyboard: {name: string; expectedFingerprint?: string};
    savePdMode: {slot: number; config: PdConfig; expectedBase?: Partial<BaseIdentity>};
    clearPdMode: {slot: number; expectedBase?: Partial<BaseIdentity>};
    duplicatePdMode: {slot: number; source: number; expectedBase?: Partial<BaseIdentity>};
    updateConfigDefaults: {sectionId: string; expectedFingerprint?: string; fields: SettingEdit[]};
}

export type EditOf<K extends keyof EditPayloads> = {type: K} & EditPayloads[K];
export type PanelEdit = {[K in keyof EditPayloads]: EditOf<K>}[keyof EditPayloads];
/** Every posted edit the draft stages: an import opens a review and a macro check is answered, neither an edit. core/model/draft-edits.js registers each one. */
export type DraftEditType = Exclude<keyof EditPayloads, 'reviewPortableProfile' | 'validateMacro'>;

/** A dense decoded slot has values even for inactive fields. */
export interface PointingSlot extends PdConfig {
    axis: number;
    heldModifiers: number;
    thresholdX: number;
    thresholdY: number;
}

export interface PdForm {
    kind(): number;
    name(): string;
    dpi(): Scalar;
    pointerLayer?: () => number;
    linkedLayers?: () => number;
    linkTurnsOn?: () => number;
    linkEnds?: () => number;
    axis?: () => number;
    thresholdX?: () => Scalar;
    thresholdY?: () => Scalar;
    emptyDirection?: () => number;
    directionOutput?: () => number;
    scrollAxes?: () => number;
    heldModifiers?: () => number;
    invert?: () => number;
    [key: `dir:${string}`]: (() => Scalar) | undefined;
    [key: `dirPolicy:${string}`]: (() => number) | undefined;
    [key: `dirMask:${string}`]: (() => number) | undefined;
    [key: `diag:${string}`]: (() => Scalar) | undefined;
    [key: `diagPolicy:${string}`]: (() => number) | undefined;
    [key: `diagMask:${string}`]: (() => number) | undefined;
    [key: `scroll:${string}`]: (() => Scalar) | undefined;
}
