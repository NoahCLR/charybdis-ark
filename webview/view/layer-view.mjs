// @ts-check
// One view of the layer stack: the layer the board shows, `at`, with the
// layers previewed on with it, `held` (layer-set.mjs). Every screen asks the
// same questions of it: which key answers at a position, what the view shows
// there, and which combos and behaviours it reaches. The answers are read from
// one value rather than worked out again from (model, layer, held) at each
// site, and each is worked out once, on first read. A model is replaced,
// never mutated, so a view is kept for as long as its model is.
//
// `at` and `held` are places in the stack, as `state.layer` is. Every model
// core publishes lists its layers in index order, so a layer's place is also
// its `index` (tests/view/layer-view.test.mjs); a mask or a switch that names
// a layer by bit still reads `layer.index`.

import {reachablePositions, resolvedPositions, viewPositions} from "./layer-resolution.mjs";
import {comboAnswers, comboBadgesAt, comboGroups, comboInputKeys, comboInputShown, comboMarks, comboUseAt, combosInView, combosOnKey, combosShownAt} from "./combo-reach.mjs";
import {behaviourGroups, behaviourKeyAt, behaviourRouteKeys, behavioursInView} from "./behaviour-reach.mjs";
/** @typedef {import("./keyface-types.js").LayerView} LayerView */
/** @typedef {import("./keyface-types.js").ResolvedKey} ResolvedKey */
/** @typedef {import("./keyface-types.js").ViewModel} ViewModel */

/** @type {WeakMap<NonNullable<ViewModel>, Map<string, LayerView>>} */
const VIEWS = new WeakMap();

// The view with `at` on top and `on` previewed on with it, as given: the
// layer set the board shows is layer-set.mjs's to keep (layersOn). The same
// layers make the same value.
/** @param {ViewModel} model @param {number} at @param {readonly number[] | null | undefined} [on] @returns {LayerView} */
export function layerView(model, at, on = []) {
    const stack = model?.layers || [];
    const held = [...(on || [])];
    if (!model) return viewOf(model, stack, at, held);
    let views = VIEWS.get(model);
    if (!views) VIEWS.set(model, views = new Map());
    const key = `${at}:${held.join(",")}`;
    let view = views.get(key);
    if (!view) views.set(key, view = viewOf(model, stack, at, held));
    return view;
}

/** @template T @param {() => T} work @returns {() => T} */
const once = (work) => {
    /** @type {{value: T} | null} */
    let kept = null;
    return () => (kept ??= {value: work()}).value;
};
/** @param {ResolvedKey[]} keys */
const byIndex = (keys) => new Map(keys.map((key) => [key.position.layoutIndex, key]));

/** @param {ViewModel} model @param {import("../../contracts/panel.js").Layer[]} stack @param {number} at @param {number[]} held @returns {LayerView} */
function viewOf(model, stack, at, held) {
    const under = (/** @type {readonly number[] | null | undefined} */ on) => layerView(model, at, on);
    // What does not change with the layers held is the layer's alone, and
    // read from there.
    const alone = once(() => held.length ? under([]) : view);
    const answers = once(() => resolvedPositions(stack, at, held));
    const shown = once(() => viewPositions(stack, at, held));
    const reachable = once(() => held.length ? alone().reachable : reachablePositions(stack, at));
    const answerAt = once(() => byIndex(answers()));
    const shownAt = once(() => byIndex(shown()));
    const comboGroupsOf = once(() => held.length ? alone().combos.groups : comboGroups(view));
    const comboRoutes = once(() => combosInView(view));
    const comboKeys = once(() => comboAnswers(view));
    const marks = once(() => comboMarks(view));
    const behaviourGroupsOf = once(() => held.length ? alone().behaviours.groups : behaviourGroups(view));
    const behaviourRoutes = once(() => behavioursInView(view));
    /** @type {LayerView} */
    const view = {
        model, stack, at, held,
        layer: stack[at] ?? stack[0],
        previewing: held.length > 0,
        get alone() { return alone(); },
        under,
        get answers() { return answers(); },
        get shown() { return shown(); },
        get reachable() { return reachable(); },
        answerAt: (layoutIndex) => layoutIndex === undefined ? undefined : answerAt().get(layoutIndex),
        shownAt: (layoutIndex) => layoutIndex === undefined ? undefined : shownAt().get(layoutIndex),
        combos: {
            get groups() { return comboGroupsOf(); },
            get inView() { return comboRoutes(); },
            get answers() { return comboKeys(); },
            get marks() { return marks(); },
            shownAt: (layoutIndex) => combosShownAt(view, layoutIndex),
            useAt: (layoutIndex, combo) => comboUseAt(view, layoutIndex, combo),
            badgesAt: (layoutIndex) => comboBadgesAt(view, layoutIndex),
            onKey: (layoutIndex) => combosOnKey(view, layoutIndex),
            inputKeys: (inputs) => comboInputKeys(view, inputs),
            inputShown: (name) => comboInputShown(view, name),
        },
        behaviours: {
            get groups() { return behaviourGroupsOf(); },
            get inView() { return behaviourRoutes(); },
            routeKeys: (keycode, route = null) => behaviourRouteKeys(view, keycode, route),
            keyAt: (layoutIndex) => behaviourKeyAt(view, layoutIndex),
        },
    };
    return view;
}
