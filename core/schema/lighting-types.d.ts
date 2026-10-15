import type {Hsv} from './types.js';
export type LightingRegistry = 'facts' | 'targets' | 'paints' | 'timings' | 'ruleExtensions' | 'domainExtensions' | 'things';
export interface LightingWorkingCapabilities {
    model: number; capacity: number; ownerBytes: number; descriptorBytes: number; slotHeaderBytes: number; memberBase: number; alignment: number;
    modules: Record<number, {domain: number; selectorParameter: number; maximumMembers: number}>;
}
export interface LightingCapabilities {
    layoutVersion: number; domainVersion: number; payloadBudget: number; paletteMaximum: number;
    conditionsPerRule: number; partParameterMaximum: number; tapDepth: number; ledCount: number;
    registries: Record<LightingRegistry, number[]>;
    working?: LightingWorkingCapabilities;
}
export interface LightingOptions {
    tapDepth?: number; logicalLayers?: number; maximumBrightness?: number; supportedModeMask?: number;
    capabilities?: LightingCapabilities; allowUnknown?: boolean;
}
export type {LightingPart, LightingRule, LightingProgram as LightingProfile} from '../../contracts/lighting.js';
