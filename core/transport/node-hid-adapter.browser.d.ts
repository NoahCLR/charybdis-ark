// What ./node-hid-adapter is in the web page. The web build puts
// web/no-native-hid.js in its place (scripts/build-web.js), and the web page's
// type check follows: tsconfig.shells.json's moduleSuffixes resolves the adapter
// to this file, so node-hid and Node's `process` stay out of that check.
// Constructing the native adapter in a browser always throws.
export declare const NodeHidDeviceAdapter: new () => never;
