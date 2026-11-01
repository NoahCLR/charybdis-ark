// @ts-check

// Whether a pointing mode's link starts it under the layers that are on: one
// of its starting layers is on, and no layer that ends a start from it is
// (firmware D-F62, pointing_mode_link_ended). Core publishes each start with
// the layers that end it (pdModes[].linkStarts, core/model/pointing-links.js);
// core's layer walk and the interface's reach both ask this as layers turn
// on (D-L73).

/** @typedef {{readonly layer: number, readonly ends: number}} LinkStart */

/** Whether `start` holds while the layers in the `active` mask are on. */
export function linkStartHolds(/** @type {LinkStart} */ start, /** @type {number} */ active) {
    return (active & (1 << start.layer)) !== 0 && (active & start.ends) === 0;
}
