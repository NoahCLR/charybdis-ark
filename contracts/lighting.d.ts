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
    rules: {index: number; key: string; identity: string; band: string; enabled: boolean; readOnly: boolean; when: string; where: string; how: string; colour?: {h: number; s: number; v: number}; canColour: boolean}[];
    bands: Record<string, string>; used: number; capacity: number; unknownRules: number; supportedPaints: number[];
}
