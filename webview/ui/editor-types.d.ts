export interface PickerOptions {
    title: string;
    context?: string;
    contextKeycode?: string;
    /** A layout key's layer, by its name: the header then names the key on it ("For Esc on Base"), never its layout index. */
    onLayer?: string;
    seed?: string[];
    mode?: 'single' | 'list';
    allowedKeys?: string[] | null;
    /** The allowed keys that the modifier buttons may wrap; every key when absent. */
    modifiable?: string[] | null;
    /** A custom key's shortcut: modifiers from either side, mixed, an optional key and any layers (firmware D-F26), handed to `onShortcut`. */
    shortcut?: {mods: number; layers?: number; layerKind?: number} | null;
    maxKeys?: number;
    /** A list's limit on keys besides modifiers: the report's key slots a macro's chord fills (firmware D-F65). */
    reportKeys?: number;
    onPick?: (expression: string) => void;
    onShortcut?: (shortcut: import('../../contracts/panel.js').CustomKeyShortcut) => void;
    /** Takes modifiers no keycode can hold as an unused custom key's shortcut: its keycode, the shortcut and a name. */
    onCustomKey?: (keycode: string, shortcut: import('../../contracts/panel.js').CustomKeyShortcut, name: string) => void;
    /** What the field does with a custom key: runs its behaviour too (default), or sends only its shortcut (a behaviour step). */
    customKeyRuns?: 'behaviour' | 'shortcut';
    /** A layout key: Use stays off for a key the draft would refuse. */
    layoutKey?: boolean;
    /** A combo's output: Tap-hold is not offered, and only what a combo can send enables Use. */
    comboOutput?: boolean;
}
