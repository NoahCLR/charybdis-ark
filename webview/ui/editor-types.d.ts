export interface PickerOptions {
    title: string;
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
    /** A layout key: Use stays off for a key the draft would refuse. */
    layoutKey?: boolean;
    /** A combo's output: Tap-hold is not offered, and only what a combo can send enables Use. */
    comboOutput?: boolean;
}
