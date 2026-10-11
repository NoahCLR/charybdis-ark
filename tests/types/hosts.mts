// These host-boundary cases compile but never open a keyboard or a window.
import {connectPanel} from '../../web/panel-channel.mjs';
import {startWebHost} from '../../web/web-host.mjs';
import type {WebEnvironment} from '../../web/types.js';
import type {PanelRequest, PanelResponse} from '../../contracts/messages.js';

function hosts(environment: WebEnvironment, response: PanelResponse) {
    const {api} = startWebHost(environment);
    const channel = connectPanel({receive: request => {const command: PanelRequest = request; void command;}});
    channel.post(response);
    api.postMessage({type: 'downloadRecovery', id: 1});
    // @ts-expect-error The browser host and extension share the same theme command.
    api.postMessage({type: 'setTheme', theme: 'blue'});
    // @ts-expect-error A model reply carries the complete published model.
    channel.post({type: 'model', model: {layers: []}});
    // @ts-expect-error A browser reply cannot stand in for an authored panel request.
    api.postMessage({type: 'macroValidation', keycode: 'VIA_MACRO_0', payload: '', requestId: 1, validation: {error: '', code: ''}});
}
void hosts;

// The browser host has page globals, plus the `buffer` package the web build
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
