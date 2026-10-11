/** Developer-only inputs and reports; never imported by the application. */
export type RepositoryName = 'firmware' | 'qmk';
export type RepositoryRoots = Record<RepositoryName, string>;
export interface UpstreamSource { repository: string; commit: string }
export interface UpstreamFile {
    path: string;
    source: string;
    /** Only the synthesized QMK version stamp has no source path. */
    sourcePath: string | null;
    sourceSha256: string;
    sha256: string;
    transformation?: string;
}
export interface UpstreamManifest {
    format: number;
    sources: Record<string, UpstreamSource>;
    files: UpstreamFile[];
}
export interface FirmwareContract {
    capabilityPages: string[];
    qmkPin?: {commit?: string} | null;
    firmwareCommit?: string;
    fixtures: Record<string, string | undefined>;
}
export interface AgreementCheck { name: string; ok: boolean; detail: string }
export interface AgreementReport {
    format: number;
    agrees: boolean;
    checks: AgreementCheck[];
    info: Record<string, string | number>;
}
export interface PublishedPin {
    name: string;
    commit: string;
    repository: string;
    ref: string;
    published: boolean;
}
export interface Checkout { path: string; revision: string; dirty: boolean; status: string }
export interface UpstreamDifference { path: string; missing: boolean }
export interface UpstreamComparison {
    pin: string | undefined;
    pinPublished: boolean;
    publishedRef: string;
    fixtures: UpstreamDifference[];
    specs: UpstreamDifference[];
    pins?: PublishedPin[];
}
export interface CompatibilityReport {
    format: number;
    publish: boolean;
    startedAt: string;
    finishedAt?: string;
    node: string;
    checkouts: Record<'firmware' | 'ark' | 'qmk', Checkout>;
    results: {runner: string; exitCode: number | null; signal: NodeJS.Signals | null; error?: string}[];
    passed: boolean;
    upstream?: UpstreamComparison;
}
export interface MarkdownContext {
    sourcePath: string;
    localPath: string;
    url: string;
    commit: string;
    imported: Map<string, string>;
}
export interface RefreshReport {
    commits: Record<RepositoryName, string>;
    content: string[];
    links: string[];
    fixtures: string[];
}
export interface CatalogEntry { value: number; name: string; label: string; group: string; aliases: string[] }
export interface KeycodeCatalog {
    format: string;
    qmkVersion: string;
    source: string;
    generatedFrom: string[];
    entries: CatalogEntry[];
}
export type FixtureCell = string | {dead: string} | null;
export interface FixtureHostLayout {
    id: number;
    slug: string;
    name: string;
    os: string;
    unicodeHexInput?: boolean;
    keys: Record<string, FixtureCell[]>;
    dead: Record<string, {space?: string} | undefined>;
    chars: Record<string, string[]>;
}
export interface HostLayoutFixture { format: number; layouts: FixtureHostLayout[] }
