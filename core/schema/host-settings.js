"use strict";
const {hostLayout, US_HOST_LAYOUT, HOST_LAYOUT_COUNT} = require("../data/host-layouts");

// Settings scalar 27: bits 0..1 the host OS (Auto, macOS, Windows, Linux),
// bit 8 Unicode playback, bits 16..23 the host layout and bit 24 a Mac that
// classified the keyboard as ISO. Feature bit 21 gates the word, bit 22 the
// layout and ISO bits.
const HOST_SETTING = 27, UNICODE_ENABLED = 0x100;
const LAYOUT_SHIFT = 16, LAYOUT_MASK = 0xff0000, MACOS_ISO = 0x1000000;
const HOST_SETTING_BITS = 0x103 | LAYOUT_MASK | MACOS_ISO;
const HOST_LAYOUT_FEATURE = 1 << 22;
const MACOS = 1;
const supportsHostLayouts = capabilities => Boolean(capabilities?.featureFlags & HOST_LAYOUT_FEATURE);
const validHostSetting = v => (v & ~HOST_SETTING_BITS) === 0 && ((v & LAYOUT_MASK) >>> LAYOUT_SHIFT) < HOST_LAYOUT_COUNT;

// How the keyboard will type macro text, as it decides at playback: through
// the layout, with Unicode entry for the rest when the OS is known and, on
// macOS, the layout is Unicode Hex Input or US with the switch on.
function hostSettings(values, detected = 0) {
    const word = values?.[HOST_SETTING] || 0, selected = word & 3;
    const effective = selected || (Number.isInteger(detected) && detected >= 0 && detected <= 3 ? detected : 0);
    const layout = hostLayout((word & LAYOUT_MASK) >>> LAYOUT_SHIFT) || hostLayout(US_HOST_LAYOUT);
    const unicodeEnabled = Boolean(word & UNICODE_ENABLED);
    const entry = effective === MACOS ? Boolean(layout.unicodeHexInput) || (layout.id === US_HOST_LAYOUT && unicodeEnabled) : Boolean(effective) && unicodeEnabled;
    return {selected, detected, effective, unicodeEnabled, unicodeMode: entry ? effective : 0,
        layout: layout.id, macosIso: Boolean(word & MACOS_ISO)};
}
module.exports = {HOST_SETTING, UNICODE_ENABLED, LAYOUT_SHIFT, LAYOUT_MASK, MACOS_ISO, HOST_SETTING_BITS, HOST_LAYOUT_FEATURE,
    supportsHostLayouts, validHostSetting, hostSettings};
