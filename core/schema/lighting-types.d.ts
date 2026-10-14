import type {Hsv} from './types.js';
export type LightingRegistry = 'facts' | 'targets' | 'paints' | 'timings' | 'ruleExtensions' | 'domainExtensions' | 'things';
export interface LightingCapabilities {
    layoutVersion: number; domainVersion: number; payloadBudget: number; paletteMaximum: number;
    conditionsPerRule: number; partParameterMaximum: number; tapDepth: number; ledCount: number;
    registries: Record<LightingRegistry, number[]>;
}
export interface LightingOptions {
    tapDepth?: number; logicalLayers?: number; maximumBrightness?: number; supportedModeMask?: number;
    capabilities?: LightingCapabilities; allowUnknown?: boolean;
}
export type {LightingPart, LightingRule, LightingProgram as LightingProfile} from '../../contracts/lighting.js';
