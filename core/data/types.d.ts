export interface ResolvedKeycode {
    value: number;
    name: string;
    label: string;
    group: string;
    kind: 'basic' | 'layer' | 'layer-tap' | 'mod-tap' | 'modified' | 'one-shot-mod' | 'layer-mod' | 'unknown';
    known: boolean;
    layer?: number;
    tap?: string;
}

export type HostLayoutCell = string | {dead: string} | null;
export interface HostLayout {
    id: number;
    slug: string;
    name: string;
    os: string;
    unicodeHexInput?: boolean;
    keys: Record<string, HostLayoutCell[]>;
    chars: string;
    strokes: Partial<Record<string, string[]>>;
    typeable: Set<string>;
}
