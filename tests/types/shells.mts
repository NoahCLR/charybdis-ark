// These shell-boundary cases compile but never open a keyboard or a window.
import {connectPanel} from '../../web/panel-channel.mjs';
import {startWebShell} from '../../web/web-shell.mjs';
import type {WebEnvironment} from '../../web/types.js';
import type {PanelRequest, PanelResponse} from '../../contracts/messages.js';

function shells(environment: WebEnvironment, response: PanelResponse) {
    const {api} = startWebShell(environment);
    const channel = connectPanel({receive: request => {const command: PanelRequest = request; void command;}});
    channel.post(response);
    api.postMessage({type: 'downloadRecovery', id: 1});
    // @ts-expect-error The web page and the extension share the same theme command.
    api.postMessage({type: 'setTheme', theme: 'blue'});
    // @ts-expect-error A model reply carries the complete published model.
    channel.post({type: 'model', model: {layers: []}});
    // @ts-expect-error A browser reply cannot stand in for an authored panel request.
    api.postMessage({type: 'macroValidation', keycode: 'VIA_MACRO_0', payload: '', requestId: 1, validation: {error: '', code: ''}});
}
void shells;

// The web shell has page globals, plus the `buffer` package the web build
// injects as `Buffer`; Node's own globals do not exist in Chrome.
function browserGlobals() {
    const report: Buffer = Buffer.from([1, 0]).subarray(0, 2);
    void report.readUInt16LE(0);
    // @ts-expect-error Chrome has no Node process.
    void process.nextTick;
    // @ts-expect-error Chrome has no setImmediate.
    void setImmediate;
    // @ts-expect-error A browser module has no __dirname.
    void __dirname;
    // @ts-expect-error The bundled Buffer declares only what core uses; Node's other members are not promised.
    void Buffer.allocUnsafe;
}
void browserGlobals;
