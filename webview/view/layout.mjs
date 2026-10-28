// @ts-check
// The keyboard's layer bank, as the interface counts it: how many layers it
// has, and the mask of all of them. The interface may not import core, so
// these copy core/data/charybdis-layout.js's LAYERS and ALL_LAYERS, pinned by
// tests/view/enum-drift.test.mjs. Where each key sits is geometry.mjs; the
// LED it carries is core's (model.leds, read through lighting.mjs).
export const LAYERS = 16, ALL_LAYERS = 2 ** LAYERS - 1;
