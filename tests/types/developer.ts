// Compile-time checks only; no server, build or native device is started.
import {serve} from '../../scripts/serve.js';
import {parseHeaders, checkStaticSite} from '../../scripts/check-static-site.js';
import {main as probe} from '../../scripts/probe-live-link.js';
import {buildWeb, bundle, buildInfo} from '../../scripts/build-web.js';
import type {DeviceAdapter} from '../../core/transport/types.js';
function tools(adapter: DeviceAdapter) {
    const server: Promise<import('node:http').Server> = serve('/tmp/ark', 8975);
    const headers: Map<string, string[]> = parseHeaders('/\n  Cache-Control: no-cache');
    probe({adapter, argv: ['--json']});
    checkStaticSite('/tmp/ark', {project: '/tmp'});
    buildWeb({outdir: '/tmp/ark', entries: {core: 'web/core.mjs'}, build: {version: 'test', commit: 'abc'}});
    bundle('core', {macroHost: 'scripts/preview-macro-host.mjs'}, '/tmp/ark', {inject: ['web/buffer.mjs']});
    buildInfo({ARK_COMMIT: 'abc'});
    // @ts-expect-error A static server listens on a numeric port.
    serve('/tmp/ark', '8975');
    // @ts-expect-error Header parsing requires text.
    parseHeaders({});
    // @ts-expect-error The native probe only needs an enumerator but it must implement one.
    probe({adapter: {connect() {}}});
    // @ts-expect-error The static-site checker needs a project path.
    checkStaticSite('/tmp/ark', {project: 1});
    // @ts-expect-error The bundle allowlist groups are core, panel and worker.
    bundle('host', {host: 'web/page.mjs'}, '/tmp/ark');
    // @ts-expect-error Output inspection needs an esbuild metafile.
    bundle('core', {core: 'web/core.mjs'}, '/tmp/ark', {metafile: false});
    // @ts-expect-error Build identity needs both version and commit.
    buildWeb({build: {version: 'test'}});
    void [server, headers];
}
void tools;
