// @ts-check
import {compileLayerAnswers} from "../../core/model/layer-resolution.js";

// Hand-authored presentation fixtures need the same facts a real model
// publishes. Only transparency matters to the compiler, so an unnamed native
// value stands in for the non-transparent key names in these fixtures.
export function withAnswers(stack) {
    const codes = stack.map(layer => {
        const positions = [];
        for (const key of layer.positions || []) positions[key.layoutIndex] = key.value
            ?? (["KC_TRANSPARENT", "KC_TRNS", "_______"].includes(key.keycode) ? 1 : 0);
        return positions;
    });
    const answers = compileLayerAnswers(codes);
    stack.forEach((layer, at) => { layer.answers = answers[at]; });
    return stack;
}
