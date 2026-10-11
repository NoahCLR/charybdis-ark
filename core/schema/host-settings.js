"use strict";
const {hostLayout, hostLayouts, US_HOST_LAYOUT, HOST_LAYOUT_COUNT} = require("../data/host-layouts");

// Settings scalar 27: bits 0..1 the host OS (Auto, macOS, Windows, Linux),
// bit 8 Unicode playback, bits 16..23 the host layout and bit 24 a Mac that
// classified the keyboard as ISO. Feature bit 21 gates the word, bit 22 the
// layout and ISO bits.
const HOST_SETTING = 27, UNICODE_ENABLED = 0x100;
const LAYOUT_SHIFT = 16, LAYOUT_MASK = 0xff0000, MACOS_ISO = 0x1000000;
const HOST_SETTING_BITS = 0x103 | LAYOUT_MASK | MACOS_ISO;
const HOST_LAYOUT_FEATURE = 1 << 22;
const MACOS = 1;
const OS_OF = [null, "macos", "windows", "linux"];
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
        layout: layout.id, layoutFits: layoutFits(layout.id, effective), macosIso: Boolean(word & MACOS_ISO)};
}

// A layout belongs to one OS, US to all of them. The keyboard types through
// the layout whatever the OS, so another OS's layout types wrong characters;
// an unknown OS fits every layout.
function layoutFits(id, effective) {
    const layout = hostLayout(id);
    return !OS_OF[effective] || !layout || layout.os === "any" || layout.os === OS_OF[effective];
}

// The layout to keep when the effective OS becomes `effective`: the same one
// if it fits, else that OS's layout of the same language, else US.
// Languages are read from the slug: `macos-german` and `windows-german` match,
// and macOS's British is the United Kingdom layout elsewhere.
function language(slug) {
    const name = slug.replace(/^[^-]+-/, "");
    return name === "british" ? "uk" : name;
}
function layoutForOs(id, effective) {
    if (layoutFits(id, effective)) return id;
    const wanted = language(hostLayout(id).slug);
    return hostLayouts().find(layout => layout.os === OS_OF[effective] && language(layout.slug) === wanted)?.id ?? US_HOST_LAYOUT;
}

// A Host edit that changes the effective OS carries the layout along
// (layoutForOs), unless the same edit chose the layout.
function followHostOs(values, before, detected) {
    const old = hostSettings(before, detected), next = hostSettings(values, detected);
    if (old.effective === next.effective || old.layout !== next.layout) return values;
    values[HOST_SETTING] = ((values[HOST_SETTING] & ~LAYOUT_MASK) | (layoutForOs(next.layout, next.effective) << LAYOUT_SHIFT)) >>> 0;
    return values;
}
module.exports = {HOST_SETTING, UNICODE_ENABLED, LAYOUT_SHIFT, LAYOUT_MASK, MACOS_ISO, HOST_SETTING_BITS, HOST_LAYOUT_FEATURE,
    supportsHostLayouts, validHostSetting, hostSettings, layoutFits, layoutForOs, followHostOs};
