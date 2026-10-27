// Compile-time checks for the renderer's posted data. This body never runs.
import {serializeMacro} from '../../webview/view/macro.mjs';
import {shellOf} from '../../webview/view/shell-panel.mjs';
import {placeState} from '../../webview/view/review.mjs';
import {participationAt} from '../../webview/view/participation.mjs';
import * as edits from '../../webview/view/edits.mjs';
import {newMode, readConfig} from '../../webview/view/pointing-config.mjs';
import {kept, resets, resetsTo} from '../../webview/view/state-fields.mjs';
import type {StateFields} from '../../webview/view/state-fields.mjs';
import type {PanelEdit, PointingSlot, BaseIdentity} from '../../contracts/edits.js';

function contracts(slot: PointingSlot, identity: BaseIdentity) {
    const messages: PanelEdit[] = [
        edits.setKey('Layer 0', 1, 'KC_A'),
        edits.placementPolicy(0, 1, true, false),
        edits.deleteBehaviour('KC_A', identity),
        edits.comboMessage(null, {inputs: ['KC_A', 'KC_B'], output: 'KC_C', termMs: '50'}),
        edits.macroMessage('MACRO_0', 'hello', 'fingerprint'),
        edits.macroProtectionMessage('MACRO_0', 'auto', 'fingerprint'),
        edits.macroValidationMessage('MACRO_0', 'hello', 1),
        edits.pdMode(slot.id, newMode(slot, 1), identity),
        edits.layerColour('Layer 1', 'ALL_KEYS', {h: '0', s: '255', v: '100'}),
    ];

    for (const message of messages) {
        if (message.type === 'savePdMode') {
            const kind: number = message.config.kind;
            void kind;
            // @ts-expect-error Pointing edits carry a slot, not a layout layer.
            message.layer;
        }
        if (message.type === 'updateMacro' && typeof message.payload === 'string') {
            const text: string = message.payload;
            void text;
        }
    }

    // @ts-expect-error Key edits carry stored keycode names, not wire numbers.
    edits.setKey('Layer 0', 1, 4);
    // @ts-expect-error Layout edits use the named Layer n reference.
    edits.setKey('0', 1, 'KC_A');
    // @ts-expect-error Participation switches are booleans.
    edits.placementPolicy(0, 1, 'true', false);
    // @ts-expect-error A macro validation request needs its correlation ID.
    edits.macroValidationMessage('MACRO_0', 'hello');
    // @ts-expect-error A posted update must say what macro value changed.
    const emptyMacro: PanelEdit = {type: 'updateMacro', keycode: 'MACRO_0'};
    // @ts-expect-error A pointing form must supply its name and DPI readers.
    readConfig(slot, {kind: () => 1});
    // @ts-expect-error Core/Node globals do not leak into the renderer environment.
    Buffer.alloc(32);
    serializeMacro([{kind: 'text', text: 'hello'}, {kind: 'tap', keys: ['KC_A']}, {kind: 'delay', delay: '120'}]);
    shellOf({shell: {theme: 'dark', build: {version: '2026.10.7', commit: 'bb1a35f'}}});
    // @ts-expect-error Macro steps describe key names; conversion to wire numbers is the core's.
    serializeMacro([{kind: 'tap', keys: [4]}]);
    // @ts-expect-error A delay step has a delay field, not key fields.
    serializeMacro([{kind: 'delay', keys: ['KC_A']}]);
    // @ts-expect-error The shell reports one of the supported panel themes.
    shellOf({shell: {theme: 'blue'}});
    placeState({kind: 'key', layer: 0, layoutIndex: 1});
    // @ts-expect-error A pointing finding names a slot rather than a layout layer.
    placeState({kind: 'pointing', layer: 0});
    // @ts-expect-error Placement permissions use matrix coordinates, not key labels.
    participationAt({}, 0, {keycode: 'KC_A'}, null);
    void emptyMacro;
}

void contracts;

import {post, setModel} from '../../webview/store.mjs';
import * as controls from '../../webview/view/controls.mjs';
import type {PanelCommand, PanelResponse} from '../../contracts/messages.js';
import type {PublishedModel} from '../../contracts/panel.js';
function panelBoundary(model: PublishedModel, reply: PanelResponse) {
    setModel(model);
    const commands: PanelCommand[] = [controls.control('refresh'), controls.applyDraft(true), controls.jumpDraft(1), controls.discardChanges(2),
        controls.moveLayer(3, {to: 2}, ['Base']), controls.moveLayer(3, {direction: -1}, ['Base']), controls.moveLayer(3, {makeBase: true}, ['Base']),
        controls.layersFollow(true, ['Base']), controls.saveLayers(['Base']), {type: 'editPortableLayer', id: 2, name: 'Symbols'}];
    commands.forEach(post);
    if (reply.type === 'macroValidation') {
        const requestId: number = reply.requestId;
        void requestId;
    }
    // @ts-expect-error A control requiring a payload cannot be built as an empty command.
    controls.control('jumpProfileDraft');
    // @ts-expect-error Layer names come from form text.
    controls.saveLayers([1]);
    // @ts-expect-error A layer move says where the layer goes.
    controls.moveLayer(0, {}, []);
    // @ts-expect-error A step moves one place up or down.
    controls.moveLayer(3, {direction: 2}, ['Base']);
    // @ts-expect-error A layer edit names what changes.
    post({type: 'editPortableLayer'});
    // @ts-expect-error A layer's id alone is no edit.
    post({type: 'editPortableLayer', id: 2});
    // @ts-expect-error A rename carries the name.
    post({type: 'editPortableLayer', id: 2, name: undefined});
    // @ts-expect-error A move goes to a slot or one step, not both.
    post({type: 'editPortableLayer', id: 2, to: 3, direction: 1});
    // @ts-expect-error The renderer posts the chosen history step.
    post({type: 'jumpProfileDraft'});
    // @ts-expect-error The renderer cannot publish a reply as an edit.
    post({type: 'model', model});
    // @ts-expect-error A partial read cannot replace a published panel model.
    setModel({layers: []});
    // The published identity, partial or absent, is posted as the edit's base without a cast.
    const based: PanelEdit[] = [edits.pdMode(0, newMode(model.pdModes[0], 1), model.profileIdentity), edits.saveBehaviour({keycode: 'KC_A', steps: []}, {}, model.profileIdentity) ?? edits.deleteBehaviour('KC_A', model.profileIdentity), edits.comboHoldTerm('200', model.profileIdentity)];
    // @ts-expect-error A base identity's generation is the revision number.
    edits.clearPdMode(0, {generation: '1'});
    void based;
}
void panelBoundary;

import {keyFace} from '../../webview/view/keyface.mjs';
import {macroReach, reachKeys, macroPlacements, namedAction} from '../../webview/view/reach.mjs';
import {comboGroups, combosOnLayer} from '../../webview/view/combo-reach.mjs';
import {reachEntries} from '../../webview/view/reach-groups.mjs';
import type {ReviewSummary} from '../../contracts/model.js';
import type {Position} from '../../contracts/panel.js';

function rendererViews(model: PublishedModel, position: Position) {
    const face = keyFace(position);
    const kind: 'none' | 'transparent' | 'disabled' | 'layer' | 'key' = face.kind;
    const behaviors = macroReach(model, model.layers, 0);
    const combos = comboGroups(model, model.layers, 0);
    const names: string[] = reachEntries(behaviors, 'here').map(entry => entry.name);
    const comboKeys: number[] = reachKeys(model.layers, 0, combos.onKeys[0]);
    const summary: ReviewSummary = {unit: 'behavior:KC_A', title: 'A', status: 'changed', place: {kind: 'behaviour'}};
    // @ts-expect-error A key face receives the stored name, not a numeric wire keycode.
    keyFace({layoutIndex: 0, keycode: 4});
    // @ts-expect-error A key import summary must retain its layer reference.
    const missingLayer: ReviewSummary = {unit: 'key', title: 'A', status: 'changed', place: {kind: 'key'}};
    // @ts-expect-error Reached keys retain their typed position rather than an unrestricted object.
    reachEntries(behaviors, 'here')[0].keys[0].position.slot;
    // @ts-expect-error The empty combo-map branch still stores typed combos.
    combosOnLayer(null, [], 0).set(0, ['KC_A']);
    const routeName: string = macroPlacements(model, model.layers, 'MACRO_0')[0].routes[0].entry.name;
    const action = namedAction(model, 'PD_MODE_0');
    if (action?.kind === 'pointing') {
        const slot: number = action.slot.id;
        void slot;
    }
    void [kind, names, comboKeys, summary, missingLayer, routeName];
}
void rendererViews;

function stateDeclarations() {
    type Panel = {screen: string; focus?: number; form: string[] | null};
    const declared: StateFields<Panel> = {screen: kept('keys'), focus: kept(undefined), form: resets(null)};
    // @ts-expect-error Every field, optional ones too, declares what a draft change does to it.
    const undeclared: StateFields<Panel> = {screen: kept('keys'), form: resets(null)};
    // @ts-expect-error A starting value has the field's type.
    const mistyped: StateFields<Panel> = {screen: kept(0), focus: kept(undefined), form: resets(null)};
    // @ts-expect-error A field states its decision rather than holding a bare value.
    const bare: StateFields<Panel> = {screen: 'keys', focus: kept(undefined), form: resets(null)};
    // A field's own rule reads the state before the change.
    const ruled: StateFields<Panel> = {screen: kept('keys'), focus: kept(undefined),
        form: resetsTo<Panel['form'], Panel>(null, (form, before) => before.screen === 'keys' ? form : null)};
    void [declared, undeclared, mistyped, bare, ruled];
}
void stateDeclarations;

import {SCREENS, isScreenId} from '../../webview/view/screens.mjs';
import type {ScreenRenderers} from '../../webview/view/screens.mjs';
import type {PanelState} from '../../webview/state.js';
function screenRegistry(state: PanelState, renderers: ScreenRenderers, id: unknown) {
    state.screen = 'lighting';
    if (isScreenId(id)) state.screen = id;
    SCREENS[state.screen].render(renderers);
    // @ts-expect-error Screen state accepts only IDs authored by the registry.
    state.screen = 'unknown';
    // @ts-expect-error An arbitrary string is not a checked screen ID.
    state.screen = String(id);
    // @ts-expect-error Rendering requires every registered screen implementation.
    SCREENS.keys.render({screenKeys: () => document.createElement('main')});
}
void screenRegistry;
