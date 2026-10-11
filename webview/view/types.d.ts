import type {Scalar} from '../../contracts/edits.js';

/** Editable macro fields retain incomplete values until they can be staged. */
export type MacroStep =
    | {kind: 'text'; text: string}
    | {kind: 'delay'; delay: Scalar}
    | {kind: 'tap'; keys: string[]}
    | {kind: 'press'; keys: string[]}
    | {kind: 'release'; keys: string[]};
export interface MacroOptions {
    unicode?: boolean;
    textEntry?: boolean;
    aliases?: Readonly<Record<string, string>>;
    keys?: readonly string[];
    modifierKeys?: readonly string[];
    layoutChars?: string | readonly string[];
}
export interface FaceRows {
    comboHeight: number;
    mainY: number;
    tierY?: number;
    comboY?: number;
    separatorY?: number;
    subY?: number;
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
    customKeys: Set<string>;
    pointing: Set<number>;
    lighting: Set<string>;
    lightingLayers: Set<number>;
    lightingSlots: Set<number>;
    settings: Set<string>;
    layerNames: boolean;
}

export interface LightOptions {held?: number[]; pdActive?: null | {locality: string; triggerIndex?: number; color: import('../../contracts/edits.js').Colour; mode: string}}
export interface LedLight {colour: import('../../contracts/edits.js').Colour; source: string; layer?: number | null}

export type PickerSection = {id: string; label: string} & ({kind: 'catalogue'; filter: (entry: Pick<import('../../contracts/panel.js').CatalogEntry, 'group'> & {value?: string; key?: string; name?: string}) => boolean} | {kind: 'board' | 'layers' | 'modes' | 'macros'});
