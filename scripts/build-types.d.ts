/** Options for the developer-only static web build. */
export interface WebBuildOptions {
    outdir?: string;
    manifestFile?: string;
    entries?: NonNullable<import('esbuild').BuildOptions['entryPoints']>;
    build?: import('../contracts/model.js').BuildInfo;
    /** Filled with the source files each bundle took (worker, panel, core). */
    inputs?: Partial<Record<'worker' | 'panel' | 'core', string[]>>;
}
