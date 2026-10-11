// What ./node-hid-adapter is in the browser host. The web build puts
// web/no-native-hid.js in its place (scripts/build-web.js), and the browser-host
// type check follows: tsconfig.hosts.json's moduleSuffixes resolves the adapter
// to this file, so node-hid and Node's `process` stay out of that check.
// Constructing the native adapter in a browser always throws.
export declare const NodeHidDeviceAdapter: new () => never;
