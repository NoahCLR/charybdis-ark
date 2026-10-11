// Compile-time checks only; this does not open the interface.
import {inspect} from '../../scripts/preview-macro-host.mjs';
import {buildPanelModel} from '../../core/session/panel-session.js';
import type {PublishedModel} from '../../contracts/panel.js';
import type {PanelRequest, PanelResponse} from '../../contracts/messages.js';
import type {PanelDeviceState} from '../../core/session/types.js';
function preview(model: PublishedModel, state: PanelDeviceState, request: Extract<PanelRequest, {type: 'validateViaMacro'}>) {
    const reply: Extract<PanelResponse, {type: 'macroValidation'}> = inspect(request, model);
    const publication: PublishedModel = buildPanelModel({service: {portable: null}}, state);
    // @ts-expect-error Preview inspection accepts validation requests, not replies.
    inspect(reply, model);
    // @ts-expect-error A preview still needs the full published model.
    inspect(request, {viaMacros: []});
    void publication;
}
void preview;
