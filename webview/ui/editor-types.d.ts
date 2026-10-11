export interface PickerOptions {
    title: string;
    context?: string;
    contextKeycode?: string;
    seed?: string[];
    mode?: 'single' | 'list';
    allowedKeys?: string[] | null;
    maxKeys?: number;
    onPick?: (expression: string) => void;
}
