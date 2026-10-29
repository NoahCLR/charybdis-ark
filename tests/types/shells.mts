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
    // @ts-expect-error The theme command takes only the panel's two themes.
    api.postMessage({type: 'setTheme', theme: 'blue'});
    // @ts-expect-error A model reply carries the complete published model.
    channel.post({type: 'model', model: {layers: []}});
    // @ts-expect-error A browser reply cannot stand in for an authored panel request.
    api.postMessage({type: 'macroValidation', keycode: 'MACRO_0', payload: '', requestId: 1, validation: {error: '', code: ''}});
    // The shell takes a worker that can fail, or none.
    const worker: WebEnvironment['worker'] = {onmessage: null, postMessage: () => {}, onerror: null, onmessageerror: null};
    startWebShell({...environment, worker});
    startWebShell({...environment, worker: undefined});
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
