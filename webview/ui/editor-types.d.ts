/** The layout key a picker changes: its layer, its position and what it holds now. */
export interface PickerTarget {layer: import('../../contracts/edits.js').LayerReference; layoutIndex: number; current?: string}
export interface PickerOptions {
    title: string;
    /** The sheet's heading, "Change F on Base"; "Choose a key" when absent. */
    heading?: string;
    /** The layout key being changed: offers the Hold slot and Transparent, and checks layer keys as the keyboard does. */
    target?: PickerTarget | null;
    /** Opens with the Hold slot's menu open ("Add a hold…"). */
    hold?: boolean;
    /** Posts a hold built in the picker: one draft edit (view/picker-choice.mjs holdEdit). */
    onEdit?: (message: import('../../contracts/edits.js').PanelEdit) => void;
    context?: string;
    contextKeycode?: string;
    seed?: string[];
    mode?: 'single' | 'list';
    allowedKeys?: string[] | null;
    /** The allowed keys that the modifier buttons may wrap; every key when absent. */
    modifiable?: string[] | null;
    /** A custom key's shortcut: modifiers from either side, mixed, and an optional key, handed to `onShortcut`. */
    shortcut?: {mods: number} | null;
    maxKeys?: number;
    onPick?: (expression: string) => void;
    onShortcut?: (shortcut: {mods: number; key: number}) => void;
    /** Takes modifiers no keycode can hold as an unused custom key's shortcut: its keycode, the shortcut and a name. */
    onCustomKey?: (keycode: string, shortcut: {mods: number; key: number}, name: string) => void;
    /** What the field does with a custom key: runs its behaviour too (default), or sends only its shortcut (a behaviour step). */
    customKeyRuns?: 'behaviour' | 'shortcut';
}
