export interface PaintColour {h: number; s: number; v: number}
export interface LightingSubject {kind: number; id: number}
export interface LightingPart {slot: number; kind: number; params: number[]}
export interface LightingRule {flags: number; brightness: number; parts: LightingPart[]; known?: boolean}
export interface LightingProgram {
    formatVersion: number; palette: {h: number; s: number; v: number}[];
    things: {kind: number; default: number[]; records: number[][]}[];
    keySets: number[][]; maps: number[][]; rules: LightingRule[];
    extensions: {kind: number; params: number[]}[]; byteLength?: number;
}
export interface LightingView {
    program: LightingProgram;
    keymap?: Record<number, Record<number, {code: number; behaviour?: number}>>;
    queryCombos?: Record<number, {enabled: boolean; inputs: number[]; layers: number[]}>;
    working: LightingWorkingCost; supportedTimings: number[];
    descriptors: Record<string, Readonly<Record<number, {parameters: string[]; place?: boolean; thing?: number; construction?: string}>>>;
    rules: {index: number; key: string; identity: string; band: string; enabled: boolean; readOnly: boolean; when: string; where: string; how: string; colour?: {h: number; s: number; v: number}; canColour: boolean}[];
    bands: Record<string, string>; paletteCapacity: number; used: number; capacity: number; unknownRules: number; supportedPaints: number[]; supportedTargets: number[]; supportedFacts: number[]; supportedThings: number[];
}

export interface LightingWorkingCost {
    required: number | null; bank: number | null; maximum: number | null; capacity?: number;
    admitted: boolean; reason?: string;
    contributors: {index: number; identities: number; members: number; slot: number; bank: number}[];
}
