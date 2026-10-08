"use strict";
// Settings domain 0x40, version 5, the only one the keyboard stores: the
// fixed part (28 values, eight layer names), then 64 macro names and 64
// custom key names, each a u8 length 0..20 and that many printable ASCII
// characters. Earlier versions carried user macros or UTF-8 macro names and
// are refused, as the firmware refuses them.
const SETTINGS = Object.freeze({VERSION: 5, COUNT: 28, LAYERS: 8, NAME_BYTES: 24, MACRO_NAMES: 64, MACRO_NAME_CHARS: 20,
    CUSTOM_KEY_NAMES: 64, FIXED_SIZE: 312, MAX_SIZE: 312 + 128 * 21});
const HEADER = Buffer.from([SETTINGS.VERSION, SETTINGS.LAYERS, SETTINGS.COUNT, SETTINGS.MACRO_NAMES, SETTINGS.CUSTOM_KEY_NAMES, 0, 0, 0]);
const asciiName = name => typeof name === "string" && /^[\x20-\x7e]*$/.test(name) && name.length <= SETTINGS.MACRO_NAME_CHARS;
const fail = message => Object.assign(new Error(message), {code: "INVALID_SETTINGS"});
function validSetting(id, v, layers = 8) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) return false;
    if ([4, 8, 20].includes(id)) return v <= 1;
    if ([5, 9].includes(id)) return v < layers;
    if (id === 7) return v <= 255;
    if (id === 15) return v > 0 && v <= 65535;
    if (id === 17) return v <= 86400000;
    if (id === 18) return v >= 400 && v <= 3400 && v % 200 === 0;
    if (id === 19) return v >= 100 && v <= 400 && v % 100 === 0;
    if (id === 21) return (v & 255) <= 1;
    if (id === 22) return v <= 0xffffff;
    if (id === 23) return v > 0 && v < 2 ** layers;
    if (id === 27) return Array.from({length: 8}, (_, i) => (v >>> (i * 4)) & 15).every(layer => layer < layers);
    return v <= 65535;
}
function encodeSettings(value, layers = 8) {
    // Values 10..14 held the pointing DPI before the pointing slots did.
    if ((value?.formatVersion ?? SETTINGS.VERSION) !== SETTINGS.VERSION || value?.values?.slice(10, 15).some(v => v !== 0)) throw fail("Unsupported settings format or retired PD settings.");
    if (!value || !Array.isArray(value.values) || value.values.length !== 28 || !value.values.every((v, id) => validSetting(id, v, layers)) || value.values[6] <= value.values[16]) throw fail("Invalid keyboard settings.");
    if (!Array.isArray(value.names) || value.names.length !== 8) throw fail("Missing layer names.");
    if (!Array.isArray(value.macroNames) || value.macroNames.length !== SETTINGS.MACRO_NAMES) throw fail("Missing macro names.");
    if (!Array.isArray(value.customKeyNames) || value.customKeyNames.length !== SETTINGS.CUSTOM_KEY_NAMES) throw fail("Missing custom key names.");
    const fixed = Buffer.alloc(SETTINGS.FIXED_SIZE); HEADER.copy(fixed);
    value.values.forEach((v, id) => fixed.writeUInt32LE(v, 8 + id * 4));
    value.names.forEach((name, id) => {
        if (typeof name !== "string" || /[\u0000-\u001f\u007f]/u.test(name) || Buffer.byteLength(name) > 23 || Buffer.from(name).toString() !== name) throw fail("Layer names must fit 23 UTF-8 bytes and contain no control characters.");
        fixed.write(name, 120 + id * 24, 23, "utf8");
    });
    const record = (name, what) => {
        if (!asciiName(name)) throw fail(`A ${what} name is up to 20 plain characters: letters, digits, spaces and punctuation.`);
        return Buffer.concat([Buffer.from([name.length]), Buffer.from(name, "ascii")]);
    };
    return Buffer.concat([fixed, ...value.macroNames.map(name => record(name, "macro")), ...value.customKeyNames.map(name => record(name, "custom key"))]);
}
function decodeSettings(bytes, layers = 8) {
    if (!Buffer.isBuffer(bytes) || bytes.length < SETTINGS.FIXED_SIZE + SETTINGS.MACRO_NAMES + SETTINGS.CUSTOM_KEY_NAMES || bytes.length > SETTINGS.MAX_SIZE || !bytes.subarray(0, 8).equals(HEADER)) throw fail("Unsupported settings format.");
    const values = Array.from({length: 28}, (_, id) => bytes.readUInt32LE(8 + id * 4));
    const names = Array.from({length: 8}, (_, id) => {
        const field = bytes.subarray(120 + id * 24, 144 + id * 24), end = field.indexOf(0);
        if (end < 0 || field.subarray(end).some(v => v)) throw fail("Invalid layer name padding.");
        const name = field.subarray(0, end).toString("utf8");
        if (!Buffer.from(name).equals(field.subarray(0, end))) throw fail("Invalid layer name encoding.");
        return name;
    });
    let offset = SETTINGS.FIXED_SIZE;
    const nameRecord = () => {
        if (offset >= bytes.length) throw fail("Missing name.");
        const length = bytes[offset++];
        if (length > SETTINGS.MACRO_NAME_CHARS || offset + length > bytes.length) throw fail("Invalid name length.");
        const name = bytes.subarray(offset, offset + length).toString("latin1");
        offset += length;
        if (!asciiName(name)) throw fail("Invalid name encoding.");
        return name;
    };
    const macroNames = Array.from({length: SETTINGS.MACRO_NAMES}, nameRecord);
    const customKeyNames = Array.from({length: SETTINGS.CUSTOM_KEY_NAMES}, nameRecord);
    if (offset !== bytes.length) throw fail("Unexpected settings data.");
    const result = {values, names, macroNames, customKeyNames, formatVersion: SETTINGS.VERSION};
    encodeSettings(result, layers);
    return result;
}
module.exports = {SETTINGS, asciiName, validSetting, encodeSettings, decodeSettings};
