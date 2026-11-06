// @ts-check
// A meter's fill (.meter, styles.css): as wide as its share, at least a
// hair so a nearly empty meter still shows one, and nothing at all when the
// share is none, said by data-empty rather than by the width the style
// holds.
import {esc} from "../lib/dom.mjs";

/** @param {number} percent 0 to 100 */
export const meterFill = (percent) => `<i style="width:${esc(percent)}%"${percent > 0 ? "" : " data-empty"}></i>`;
