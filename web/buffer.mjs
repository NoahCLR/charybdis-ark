// core/ uses Node's global Buffer. The web build injects this file, so every
// bare `Buffer` in the bundle is the `buffer` package's: the same API over a
// Uint8Array, without rewriting a module of core/ for the browser. The trailing
// slash names the package, never Node's built-in.
export {Buffer} from "buffer/";
