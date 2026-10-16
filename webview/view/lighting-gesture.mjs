// @ts-check
import {behaviourEditorRow, behaviourTimingField} from "./behavior-editor.mjs";
import {lightingSituation} from "./lighting-rules.mjs";
import {nativeIdentity} from "./lighting-facts.mjs";
import {helperWord} from "./vocabulary.mjs";
import {participationAt} from "./participation.mjs";
/** @typedef {import('./lighting-simulator-types.js').Observation} Observation */
/** An authored, solitary gesture illustration. It does not run the QMK planner.
 * @param {import('../../contracts/panel.js').PublishedModel} model @param {string} keycode @param {number} layer @param {number} owner @param {number} [pressCount] @param {"hold" | "tap"} [path] */
export function lightingGesture(model, keycode, layer, owner, pressCount = 1, path = "hold") {
    const row = behaviourEditorRow(model, keycode), id = model.keyBehaviors.findIndex(r => r.keycode === row?.keycode);
    /** @type {{label: string; detail: string; observation: Observation; blinkAt: number}[]} */ const steps = [];
    const notes = ["Solitary local gesture. No pointer interception, combo arbitration, foreign-key buffering or physical timing is predicted."];
    if (!row) return {steps, notes: ["Choose a configured behaviour."]};
    /** @param {"tapHoldTerm" | "longerHoldTerm" | "multiTapTerm"} name */
    const term = name => {const f = behaviourTimingField(row, name);return Number(f.followsDefault ? f.fallback : f.stored);};
    const terms = {hold: term("tapHoldTerm"), long: term("longerHoldTerm"), multi: term("multiTapTerm")};
    if (Object.values(terms).some(n => !Number.isInteger(n) || n <= 0)) return {steps, notes: ["This row's effective timing is unavailable."]};
    const depth = Math.max(1, ...row.steps.filter(s => s.tap || s.hold || s.longHold).map(s => s.tapCount + 1)), count = (Math.max(1, pressCount) - 1) % depth + 1;
    if (row.enabled === false || !((row.allowedLayers ?? 65535) & 1 << layer)) return {steps, notes: ["This behaviour is disabled on this source layer."]};
    const policy = participationAt(model, layer, {row: Math.floor(owner / 6), column: owner % 6}, row);
    if (policy && !policy.enabled) return {steps, notes: [`This behaviour is inactive here: ${policy.reasons.join("; ")}. No authored feedback is inferred.`]};
    const code = model.rgb.lighting?.keymap?.[layer]?.[owner]?.code, native = row.code ?? model.qmkKeycodes.find(k => k.key === row.keycode || k.value === row.keycode)?.keycode;
    if (native === undefined || code !== native) return {steps, notes: ["The chosen matrix key does not directly name this behaviour on this native layer. Transparent lower-layer resolution and combo-output origins need a different situation."]};
    const pressDuration = Math.max(0, Math.min(1, terms.hold - 1, terms.long - 1)), cycle = pressDuration + 1;
    notes.unshift(`${pressDuration} ms presses and 1 ms gaps select the requested branch on a logical clock.`);
    /** @param {number} n */
    const authored = n => row.steps.some(s => s.tapCount === n - 1 && (s.tap || s.hold || s.longHold));
    const branch = row.steps.find(s => s.tapCount === count - 1), base = lightingSituation(model, [{kind: 1, params: [layer], keys: []}]);
    const unresolved = (path === "tap" ? [branch?.tap] : [branch?.hold, branch?.longHold]).find(a => a && (a.code === 1 || /^0x/i.test(a.action)));
    if (unresolved) return {steps, notes: [`${unresolved.action} needs transparent or unknown-action resolution. This conditional path is not simulated; no fired event or output is invented.`]};
    /** @param {number} n */
    const previewFor = n => {const hold = row.steps.find(s => s.tapCount === n - 1)?.hold, code = hold?.code;if (hold?.helper !== "PRESS_AND_HOLD_UNTIL_RELEASE" || code === undefined || code < 0x5220 || code > 0x523f) return null;return nativeIdentity(code)?.[1] ?? null;};
    /** @type {number | null} */ let previewLayer = null;
    /** @type {[number, number] | null} */ let heldIdentity = null;
    /** @param {import('../../contracts/panel.js').Branch | undefined} action */
    const dispatch = action => {
        const code = action?.code;if (code === undefined) return;
        const identity = nativeIdentity(code);if (!identity) return;
        if (identity[0] === 1) {
            if (code >= 0x5200 && code <= 0x521f) base.layers = [identity[1]];
            else if (code >= 0x5260 && code <= 0x527f || code >= 0x7ec0 && code <= 0x7ecf) {
                const active = new Set([0, ...base.layers ?? []]);if (identity[1] !== 0 && active.has(identity[1])) active.delete(identity[1]);else active.add(identity[1]);base.layers = [...active];base.lockedLayers = [...active].filter(l => l !== 0);
            } else if (code >= 0x5280 && code <= 0x529f) {base.oneshotLayer = identity[1];base.layers = [...base.layers ?? [], identity[1]];}
            else notes.push(`${action?.label || action?.action}: transient/default layer dispatch is conditional; no persistent layer change is inferred.`);
        } else notes.push(`${action?.label || action?.action}: nested mode/macro dispatch is not executed by this illustration.`);
    };
    let blinkAt = -1, physicallyPressed = true;
    /** @type {{at: number; state: 'tap' | 'hold' | 'long'; outcome: number; branch: number} | null} */ let pulse = null;
    const flash = Number(model.configDefaults.flatMap(s => s.fields).find(f => f.macro === "feedbackFlash")?.value);
    /** @param {number} time @param {string} label @param {string} detail @param {'branch' | 'tap' | 'hold' | 'long' | null} state @param {number[]} phases @param {import('./lighting-simulator-types.js').Event | null} [event] @param {number} [outcome] @param {boolean} [flashing] @param {number} [branchNumber] */
    const add = (time, label, detail, state, phases, event = null, outcome = 0, flashing = false, branchNumber = count) => {
        const situation = structuredClone(base);situation.time = time;
        situation.pressedKeys = physicallyPressed ? [owner] : [];
        if (!physicallyPressed) {heldIdentity = null;previewLayer = null;}
        if (previewLayer !== null) situation.preview = previewLayer;
        if (heldIdentity?.[0] === 1) {situation.layers = [layer, heldIdentity[1]];situation.layerOwners = {[owner]: heldIdentity[1]};}
        if (heldIdentity?.[0] === 2) situation.mode = {id: heldIdentity[1], keys: [owner], halves: [owner < 30 ? "left" : "right"]};
        if (id >= 0 && phases.length) situation.behaviourPhases = {[owner]: {id, phases, branch: branchNumber}};
        if (!state && pulse && time < pulse.at + flash) {state = pulse.state;outcome = pulse.outcome;branchNumber = pulse.branch;flashing = false;}
        if (state && id >= 0) {
            situation.behaviour = {keys: {[owner]: {id, state, branch: branchNumber, outcome, flashing, lit: !flashing || blinkAt < 0 || Math.floor((time - blinkAt) / flash) % 2 === 0}}, owners: {board: owner, [owner < 30 ? "left" : "right"]: owner, [state]: owner}};
            if (heldIdentity || previewLayer !== null) situation.behaviour.standardKeys = {};
            if (state === "tap" && branchNumber === 1) situation.behaviour.standardKeys = {};

        }
        steps.push({label, detail, observation: {situation, event}, blinkAt});
    };
    for (let n = 1; n < count; n++) {
        physicallyPressed = true;previewLayer = previewFor(n);
        add((n - 1) * cycle, `Press ${n}`, "Selects a candidate; no tap-fired event.", previewLayer !== null ? "hold" : n > 1 && authored(n) ? "branch" : null, n > 1 && authored(n) ? [0, 1] : [1], null, previewLayer === null ? 0 : previewLayer + 1, false, n);
        physicallyPressed = false;
        add((n - 1) * cycle + pressDuration, `Release ${n}`, `Series remains pending. A next press at gap 1 ms is within ${terms.multi} ms, including equality.`, n > 1 && authored(n) ? "branch" : null, n > 1 && authored(n) ? [0, 1] : [1], null, 0, false, n);
    }
    const start = (count - 1) * cycle;physicallyPressed = true;previewLayer = previewFor(count);
    add(start, `Press ${count} · branch ${count}`, "Candidate selected, before any tap emission.", previewLayer !== null ? "hold" : count > 1 && authored(count) ? "branch" : null, count > 1 && authored(count) ? [0, 1] : [1], null, previewLayer === null ? 0 : previewLayer + 1);
    if (!branch?.hold && !branch?.longHold && row.builtIn?.hold) notes.push("This branch keeps a built-in held path. Immediate/default hold planning is conditional and is not replayed here; use explicit facts to explore its lighting.");
    /** @type {{at: number; tier: 'hold' | 'long'; action: import('../../contracts/panel.js').Branch}[]} */ const thresholds = [];
    if (path === "hold" && branch?.hold) thresholds.push({at: terms.hold, tier: "hold", action: branch.hold});
    if (path === "hold" && branch?.longHold) thresholds.push({at: terms.long, tier: "long", action: branch.longHold});
    if (path === "hold" && branch?.tap && !branch.hold && branch.longHold && terms.multi < terms.long) thresholds.push({at: terms.multi, tier: "hold", action: {...branch.tap, helper: "TAP_SENDS"}});
    thresholds.sort((a, b) => a.at - b.at);
    /** @type {'branch' | 'tap' | 'hold' | 'long' | null} */ let state = previewLayer !== null ? "hold" : count > 1 && authored(count) ? "branch" : null;
    let outcome = previewLayer === null ? 0 : previewLayer + 1, flashing = false, phases = count > 1 && authored(count) ? [0, 1] : [1];
    for (const t of thresholds) {
        if (t.at > 0) add(start + t.at - 1, `Before ${t.tier === "long" ? "long hold" : t.action.helper === "TAP_SENDS" ? "tap settles" : "hold"}`, `${t.at - 1} ms since this press.`, state, phases, null, outcome, flashing);
        const actionCode = t.action.code ?? model.qmkKeycodes.find(k => k.key === t.action.action || k.value === t.action.action)?.keycode;
        if (actionCode === undefined || actionCode <= 1) {notes.push(`${t.tier}: ${t.action.action} needs transparent or unsupported action resolution; no outcome or fired event is invented.`);continue;}
        const identity = nativeIdentity(actionCode);outcome = identity?.[0] === 1 ? identity[1] + 1 : identity?.[0] === 2 ? identity[1] + 33 : 0;
        const helper = t.action.helper;
        state = helper === "TAP_SENDS" ? "tap" : t.tier;phases = [helper === "TAP_SENDS" ? 1 : helper === "TAP_ON_RELEASE_AFTER_HOLD" ? 2 : state === "hold" ? 3 : 4];
        flashing = helper === "PRESS_AND_HOLD_UNTIL_RELEASE" || helper === "REPEAT_WHILE_HELD";
        blinkAt = start + t.at;
        previewLayer = null;
        heldIdentity = helper === "PRESS_AND_HOLD_UNTIL_RELEASE" && identity && (identity[0] === 1 || identity[0] === 2 && model.pdModes.some(m => m.id === identity[1] && m.kind)) ? identity : null;
        if (helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD") dispatch(t.action);
        const fires = helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD" || helper === "PRESS_AND_HOLD_UNTIL_RELEASE";
        const event = fires && id >= 0 ? {kind: t.tier === "long" ? 8 : 7, thing: id, owners: [owner], slot: t.tier === "long" ? 1 : 0, outcome} : null;
        if (helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD") pulse = {at: start + t.at, state: t.tier, outcome, branch: count};
        add(start + t.at, `${state === "tap" ? "Tap candidate settled" : t.tier === "long" ? "Long hold" : "Hold"} · ${t.at} ms`, `${t.action.label || t.action.action} · ${helperWord(model, t.tier, helper ?? "")}${helper === "REPEAT_WHILE_HELD" ? ` at ${t.action.repeatHz} Hz; repeats are not enumerated` : ""}${helper === "TAP_ON_RELEASE_AFTER_HOLD" || helper === "TAP_SENDS" ? "; waits for release" : "; active at threshold"}`, state, phases, event, outcome, flashing);
    }
    if (path === "tap" || !branch?.hold && !branch?.longHold) {
        // Tap-only path: release, equality boundary, strict series settlement.
        physicallyPressed = false;
        add(start + pressDuration, "Release", "Tap waits for series settlement when this row has multiple branches.", count > 1 && authored(count) ? "branch" : null, [1]);
        if (depth > 1) add(start + pressDuration + terms.multi, "Multi-tap equality", "An on-time continuation still belongs to this series.", count > 1 && authored(count) ? "branch" : null, [1]);
        const settle = start + pressDuration + (depth > 1 ? terms.multi + 1 : 0), action = branch?.tap ?? row.builtIn?.tap;
        if (!branch?.tap && action) notes.push(`Omitted tap uses ${action.label || action.action}${count > 1 ? ` once per press (${count} times)` : ""}; it has no authored tap-commit pulse.`);
        dispatch(action);
        const tapPulse = Boolean(branch?.tap && count > 1 && model.rgb.lighting?.program.extensions.some(e => e.kind === 2) && action?.code && !nativeIdentity(action.code));
        if (tapPulse) pulse = {at: settle, state: "tap", outcome: 0, branch: count};
        add(settle, "Tap emitted", action ? action.action : "Built-in tap fallback; no authored tap-commit feedback.", tapPulse ? "tap" : null, [], action && id >= 0 ? {kind: 6, thing: id, branch: count, owners: [owner]} : null);
    } else {
        const end = start + Math.max(...thresholds.map(t => t.at), 0) + 1;
        const tier = branch.longHold ?? branch.hold, firesOnRelease = tier?.helper === "TAP_ON_RELEASE_AFTER_HOLD";
        if (firesOnRelease) {dispatch(tier);pulse = {at: end, state: branch.longHold ? "long" : "hold", outcome, branch: count};}
        physicallyPressed = false;
        add(end, "Release", firesOnRelease ? `Sends ${tier.action} on release.` : "Ends the held action; no additional threshold event.", null, [], firesOnRelease && id >= 0 ? {kind: branch.longHold ? 8 : 7, thing: id, owners: [owner], slot: branch.longHold ? 1 : 0, outcome} : null);
    }
    if (Number.isInteger(flash) && flash > 0) {
        const last = steps.at(-1)?.observation.situation.time ?? start;
        if (pulse && pulse.at + flash - 1 >= last) add(pulse.at + flash - 1, "Before feedback ends", `${flash - 1} ms after the emitted action; the feedback pulse is still eligible.`, null, []);
        add(Math.max(last + 1, pulse ? pulse.at + flash : last + flash), "Feedback interval", `${flash} ms is the configured feedback half-period. Event flash rules retain their own durations.`, null, []);
    } else notes.push("Feedback flash interval is unavailable; no fixed duration is substituted.");
    if (path === "hold" && branch?.hold && branch.longHold && terms.long <= terms.hold) {notes.push("Hold thresholds overlap. The normal Hold-then-Long-hold progression is conditional on helper mode and scan order; this path is not simulated.");return {steps: [], notes, depth, terms};}
    return {steps, notes, depth, terms, flash};
}

/** Include actual feedback half-cycle transitions between displayed milestones.
 * The UI lists meaningful gesture moments; the renderer still sees every edge.
 * @param {{observation: Observation; blinkAt: number}[]} steps @param {number | undefined} flash @returns {Observation[]} */
export function gestureHistory(steps, flash) {
    /** @type {Observation[]} */ const history = [];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i], previous = steps[i - 1];
        if (previous && flash && Number.isInteger(flash) && flash > 0) {
            const from = previous.observation.situation.time ?? 0, until = step.observation.situation.time ?? 0;
            const keys = previous.observation.situation.behaviour?.keys;
            if (keys && Object.values(keys).some(k => k.flashing)) {
                const epoch = previous.blinkAt;
                for (let time = epoch + (Math.floor((from - epoch) / flash) + 1) * flash; time < until; time += flash) {
                    const situation = structuredClone(previous.observation.situation);situation.time = time;
                    for (const key of Object.values(situation.behaviour?.keys ?? {})) if (key.flashing) key.lit = Math.floor((time - epoch) / flash) % 2 === 0;
                    history.push({situation});
                }
            }
        }
        history.push(step.observation);
    }
    return history;
}
