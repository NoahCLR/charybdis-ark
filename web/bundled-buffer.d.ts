// The web page's type check has no Node globals. Its one exception is `Buffer`,
// which core/ uses as a global: the web build injects web/buffer.mjs, the
// `buffer` package, as every bare `Buffer` in the bundle. These are the members
// core/ uses, with Node's signatures, which the package implements; the
// package's own declarations predate several of them (a `subarray` returning
// a Buffer, optional offsets). A member core/ starts using goes here.
declare global {
    interface Buffer extends Uint8Array {
        subarray(start?: number, end?: number): Buffer;
        toString(encoding?: BufferEncoding, start?: number, end?: number): string;
        equals(other: Uint8Array): boolean;
        copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
        write(string: string, offset?: number, length?: number, encoding?: BufferEncoding): number;
        readUInt16LE(offset?: number): number;
        readUInt16BE(offset?: number): number;
        readUInt32LE(offset?: number): number;
        writeUInt16LE(value: number, offset?: number): number;
        writeUInt16BE(value: number, offset?: number): number;
        writeUInt32LE(value: number, offset?: number): number;
    }
    interface BufferConstructor {
        readonly prototype: Buffer;
        [Symbol.hasInstance](value: unknown): value is Buffer;
        alloc(size: number, fill?: string | Uint8Array | number): Buffer;
        byteLength(string: string, encoding?: BufferEncoding): number;
        compare(a: Uint8Array, b: Uint8Array): -1 | 0 | 1;
        concat(list: readonly Uint8Array[], totalLength?: number): Buffer;
        from(data: string, encoding?: BufferEncoding): Buffer;
        from(data: Uint8Array | readonly number[]): Buffer;
        from(arrayBuffer: ArrayBufferLike, byteOffset?: number, length?: number): Buffer;
        isBuffer(value: unknown): value is Buffer;
    }
    type BufferEncoding = 'ascii' | 'utf8' | 'utf-8' | 'latin1' | 'binary' | 'hex' | 'base64';
    const Buffer: BufferConstructor;
}
export {};
