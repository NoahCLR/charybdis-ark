import type {Scalar} from '../../contracts/edits.js';

/** Editable macro fields retain incomplete values until they can be staged. */
export type MacroStep = ({focusId?: string} & (
    | {kind: 'text'; text: string}
    | {kind: 'delay'; delay: Scalar}
    | {kind: 'tap'; keys: string[]}
    | {kind: 'press'; keys: string[]}
    | {kind: 'release'; keys: string[]}));
export interface MacroOptions {
    textEntry?: boolean;
    /** The model whose names a key is read by (view/key-identity.mjs): KC_LGUI is KC_LEFT_GUI. */
    model?: import('./keyface-types.js').ViewModel;
    keys?: readonly string[];
    modifierKeys?: readonly string[];
    layoutChars?: string | readonly string[];
    /** The words for each reason a macro does not read (vocabulary.macroProblems). */
    problems?: Readonly<Record<string, string>>;
}
export interface FaceRows {
    comboHeight: number;
    mainY: number;
    tierY?: number;
    comboY?: number;
    separatorY?: number;
    subY?: number;
    /** The top of the row of icons, and how tall they are, when the key has any. */
    iconY?: number;
    iconSize?: number;
}

export interface ReviewBlock {
    group?: number | null;
    title: string | null;
    area: string;
    size: number;
    elsewhere: string[];
    items: import('../../contracts/model.js').ReviewChange[];
}
export interface DraftMarks {
    keys: Map<number, Set<number | undefined>>;
    layers: Set<number>;
    behaviours: Set<string>;
    combos: Set<number>;
    macros: Set<string>;
    /** The autocorrect entries changed, by correction. */
    autocorrect: Set<string>;
    customKeys: Set<string>;
    pointing: Set<number>;
    lighting: Set<string>;
    lightingLayers: Set<number>;
    lightingSlots: Set<number>;
    settings: Set<string>;
    layerNames: boolean;
}

export interface LightOptions {held?: number[];
    /** A running pointing mode: its colour, locality, the key or keys that started it (a holding combo's inputs) and its mode id. */
    pdActive?: null | {locality: string; triggerIndex?: number | readonly number[]; color: import('../../contracts/edits.js').Colour; mode: string};
    /** A held combo's feedback: its colour, locality, the keys of its inputs in the view, and whether it paints beneath the pointing mode its output runs (comboHeld). */
    comboActive?: null | {locality: string; inputs: readonly number[]; color: import('../../contracts/edits.js').Colour; beneath?: boolean};
    /** A replacement flash showing: its case (an RGB_AUTOCORRECT_SEMANTICS name), that case's colour, the locality, and the key that caused it, when one is known. */
    replacementActive?: null | {owner: string; locality: string; triggerIndex?: number; color: import('../../contracts/edits.js').Colour}}
export interface LedLight {colour: import('../../contracts/edits.js').Colour; source: string; layer?: number | null}

export type PickerEntry = Pick<import('../../contracts/panel.js').CatalogEntry, 'group'> & {value?: string; key?: string; name?: string; offered?: boolean};
export type PickerKeyGroup = {name: string; takes: (entry: PickerEntry, model: import('../../contracts/panel.js').PublishedModel | null) => boolean; order?: string[]};
export type PickerSection = {id: string; label: string} & ({kind: 'catalogue'; filter: (entry: PickerEntry) => boolean; groups: PickerKeyGroup[]} | {kind: 'board' | 'layers' | 'modes' | 'macros' | 'all'});
