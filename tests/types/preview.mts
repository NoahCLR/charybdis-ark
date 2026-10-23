// Compile-time checks only; this does not open the interface.
import {inspect} from '../../scripts/preview-macro-shell.mjs';
import {buildPanelModel} from '../../core/session/panel-session.js';
import type {PublishedModel} from '../../contracts/panel.js';
import type {PanelRequest, PanelResponse} from '../../contracts/messages.js';
import type {PanelDeviceState} from '../../core/session/types.js';
function preview(model: PublishedModel, state: PanelDeviceState, request: Extract<PanelRequest, {type: 'validateMacro'}>) {
    const reply: Extract<PanelResponse, {type: 'macroValidation'}> = inspect(request, model);
    const publication: PublishedModel = buildPanelModel({service: {portable: null}}, state);
    // @ts-expect-error Preview inspection accepts validation requests, not replies.
    inspect(reply, model);
    // @ts-expect-error A preview still needs the full published model.
    inspect(request, {macros: []});
    void publication;
}
void preview;
