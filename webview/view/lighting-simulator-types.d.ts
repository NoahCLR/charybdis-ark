import type {LightingProgram, LightingRule} from '../../contracts/lighting.js';
export type Half = 'left' | 'right';
export interface Subject {kind: number; thing: number; slot: number; outcome: number; keys: number[]; halves: Half[]; natural?: number; entry?: bigint; authored?: number}
export interface Behaviour {id?: number; state: 'branch' | 'tap' | 'hold' | 'long'; branch?: number; flashing?: boolean; lit?: boolean; outcome?: number}
export interface Mode {id: number; locked?: boolean; keys?: number[]; halves?: Half[]}
export interface Situation {
 time?: number; layers?: number[]; mapped?: Record<number, number[]>; preview?: number; mode?: Mode; modeStatus?: Mode;
 combos?: {owning?: number[]; others?: number[]; instances?: {id: number; role: number; keys: number[]}[]};
 behaviour?: {keys: Record<number, Behaviour>; standardKeys?: Record<number, Behaviour>; owners?: Record<string, number>};
 layerOwners?: Record<number, number>; lockedLayers?: number[]; oneshotLayer?: number;
 comboLayers?: {id: number; layer: number; keys: number[]}[];
 behaviourPhases?: Record<number, {id: number; phases: number[]; branch: number}>;
 macroPlaying?: number; pressedKeys?: number[]; modifiers?: number[]; hostLocks?: number; pointer?: number; idle?: boolean;
 effect?: Record<number, string>; fade?: {autoMouseLayer: number; progress: number; timeout: number; deadTime: number};
 keymap?: Record<number, Record<number, {code: number; behaviour?: number}>>;
 queryCombos?: Record<number, {inputs: number[]; layers?: number[]; enabled?: boolean}>;
}
export interface Event {kind: number; thing: number; branch?: number; key?: number; owners?: number[]; slot?: number; outcome?: number}
export interface Timing {show_after?: number; linger?: number; flash?: number}
export interface Lifetime<T> {phase: 'empty' | 'match' | 'tail' | 'flash'; age: number; eligible: boolean; batch: T | null; entry: bigint}
export interface Entry {index: number; rule: LightingRule; subject: Subject; target: number[]}
export type Program = LightingProgram;

export interface Contribution {index: number; subject: Subject; source: string; scene?: string; weight?: number; target: boolean; readsBelow: boolean; colour: number[] | null}
export interface Observation {situation: Situation; event?: Event | null}
