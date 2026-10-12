export interface PickerOptions {
    title: string;
    context?: string;
    contextKeycode?: string;
    seed?: string[];
    mode?: 'single' | 'list';
    allowedKeys?: string[] | null;
    /** The allowed keys that the modifier buttons may wrap; every key when absent. */
    modifiable?: string[] | null;
    maxKeys?: number;
    onPick?: (expression: string) => void;
}
