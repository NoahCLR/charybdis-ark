// @ts-check
import {behaviourEditorRow, behaviourTimingField} from "./behavior-editor.mjs";
import {lightingSituation} from "./lighting-rules.mjs";
import {classifyGestureAction, applyGestureAction} from "./lighting-action.mjs";
import {nativeIdentity} from "./lighting-facts.mjs";
import {helperWord} from "./vocabulary.mjs";
import {participationAt} from "./participation.mjs";
/** @typedef {import('./lighting-simulator-types.js').Observation} Observation */
/** An authored, solitary gesture illustration. It does not run the QMK planner.
 * @param {import('../../contracts/panel.js').PublishedModel} model @param {string} keycode @param {number} layer @param {number} owner @param {number} [pressCount] @param {"hold" | "tap"} [path] @param {import("./lighting-simulator-types.js").Situation} [initial] */
export function lightingGesture(model, keycode, layer, owner, pressCount = 1, path = "hold", initial = {}) {
    const row = behaviourEditorRow(model, keycode), id = model.keyBehaviors.findIndex(r => r.keycode === row?.keycode);
    /** @type {{label: string; detail: string; observation: Observation; blinkAt: number; effects?: import("./lighting-simulator-types.js").Event[]}[]} */ const steps = [];
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
    const branch = row.steps.find(s => s.tapCount === count - 1), base = {...lightingSituation(model, [{kind: 1, params: [layer], keys: []}]), ...structuredClone(initial)};
    const unresolved = (path === "tap" ? [branch?.tap] : [branch?.hold, branch?.longHold]).find(a => a && (a.code === 1 || /^0x/i.test(a.action)));
    if (unresolved) return {steps, notes: [`${unresolved.action} needs transparent or unknown-action resolution. This conditional path is not simulated; no fired event or output is invented.`]};
    if (layer !== 0 && initial.layers === undefined) notes.push("The source layer starts active with unspecified ownership. Other owners and locks are not inferred from an active bit.");
    const pathActions = path === "tap" ? [branch?.tap] : [branch?.hold, branch?.longHold];
    for (const a of pathActions) if (a?.code !== undefined) {
        const classified = classifyGestureAction(model, a.code);
        if (classified.kind === "conditional" || a.helper === "REPEAT_WHILE_HELD" && classified.kind !== "key") return {steps, notes: [...notes, classified.reason ?? "Repeated state-changing native actions need each repeat and policy input; this conditional path is not replayed."]};
    }
    /** The pinned handled_key_policy preview requires the tap and any longer
     * action to lead to the held layer too. An MO alone is not that promise.
     * @param {import('../../contracts/panel.js').Branch | undefined} action */
    const heldLayer = action => action?.helper === "PRESS_AND_HOLD_UNTIL_RELEASE" && action.code !== undefined && classifyGestureAction(model, action.code).kind === "layer-hold" ? nativeIdentity(action.code)?.[1] ?? null : null;
    /** @param {import('../../contracts/panel.js').Branch | undefined} action @param {number} layer */
    const leadsToLayer = (action, layer) => action?.code !== undefined && ["layer-goto", "layer-toggle"].includes(classifyGestureAction(model, action.code).kind) && nativeIdentity(action.code)?.[1] === layer;
    /** @param {number} n */
    const previewFor = n => {
        const step = row.steps.find(s => s.tapCount === n - 1), layer = heldLayer(step?.hold);
        return layer !== null && leadsToLayer(step?.tap, layer) && (!step?.longHold || heldLayer(step.longHold) === layer || leadsToLayer(step.longHold, layer)) ? layer : null;
    };
    /** @type {number | null} */ let previewLayer = null;
    /** Registered output outlives a release-pending longer tier. Its ownership
     * and its visible feedback are separate, as in feedback.c.
     * @type {number | null} */ let registeredCode = null;
    /** @type {import("./lighting-simulator-types.js").Event[]} */ let effects = [];
    const releaseRegistered = () => {
        if (registeredCode !== null) effects.push(...applyGestureAction(base, classifyGestureAction(model, registeredCode), "release", owner));
        registeredCode = null;
    };
    /** @param {import('../../contracts/panel.js').Branch | undefined} action */
    const dispatch = action => {
        if (action?.code === undefined) return;
        const classified = classifyGestureAction(model, action.code);
        if (classified.kind === "conditional") notes.push(classified.reason ?? "This native action is conditional.");
        else effects.push(...applyGestureAction(base, classified, "tap", owner));
    };
    let blinkAt = -1, physicallyPressed = true;
    /** @type {{at: number; state: 'tap' | 'hold' | 'long'; outcome: number; branch: number} | null} */ let pulse = null;
    const flash = Number(model.configDefaults.flatMap(s => s.fields).find(f => f.macro === "feedbackFlash")?.value);
    /** @param {number} time @param {string} label @param {string} detail @param {'branch' | 'tap' | 'hold' | 'long' | null} state @param {number[]} phases @param {import('./lighting-simulator-types.js').Event | null} [event] @param {number} [outcome] @param {boolean} [flashing] @param {number} [branchNumber] */
    const add = (time, label, detail, state, phases, event = null, outcome = 0, flashing = false, branchNumber = count) => {
        const situation = structuredClone(base);situation.time = time;
        situation.pressedKeys = physicallyPressed ? [owner] : [];
        if (!physicallyPressed) previewLayer = null;
        if (previewLayer !== null) situation.preview = previewLayer;
        if (id >= 0 && phases.length) situation.behaviourPhases = {[owner]: {id, phases, branch: branchNumber}};
        if (!state && pulse && time < pulse.at + flash) {state = pulse.state;outcome = pulse.outcome;branchNumber = pulse.branch;flashing = false;}
        if (state && id >= 0) {
            situation.behaviour = {keys: {[owner]: {id, state, branch: branchNumber, outcome, flashing, lit: !flashing || blinkAt < 0 || Math.floor((time - blinkAt) / flash) % 2 === 0}}, owners: {board: owner, [owner < 30 ? "left" : "right"]: owner, [state]: owner}};
            if (registeredCode !== null && !classifyGestureAction(model, registeredCode).keepsFeedback || previewLayer !== null) situation.behaviour.standardKeys = {};
            if (state === "tap" && branchNumber === 1) situation.behaviour.standardKeys = {};

        }
        steps.push({label, detail, observation: {situation, event}, blinkAt, effects});effects = [];
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
        const classified = classifyGestureAction(model, actionCode);outcome = classified.outcome;
        const helper = t.action.helper;
        state = helper === "TAP_SENDS" ? "tap" : t.tier;phases = [helper === "TAP_SENDS" ? 1 : helper === "TAP_ON_RELEASE_AFTER_HOLD" ? 2 : state === "hold" ? 3 : 4];
        if (helper === "PRESS_AND_HOLD_UNTIL_RELEASE") {
            releaseRegistered();registeredCode = actionCode;
            effects.push(...applyGestureAction(base, classified, "press", owner));
        } else if (helper !== "TAP_ON_RELEASE_AFTER_HOLD" && helper !== "TAP_SENDS") releaseRegistered();
        const delegated = registeredCode !== null && !classifyGestureAction(model, registeredCode).keepsFeedback;
        flashing = helper === "REPEAT_WHILE_HELD" || registeredCode !== null && !delegated;
        if (delegated && !outcome) state = null;
        // A pending longer release changes the phase/outcome, not the held
        // output. A delegated prior output may leave no current feedback slot.
        if (helper === "TAP_ON_RELEASE_AFTER_HOLD" && registeredCode !== null) phases = [t.tier === "long" ? 4 : 3];
        if (helper !== "TAP_ON_RELEASE_AFTER_HOLD") blinkAt = start + t.at;
        previewLayer = null;
        if (helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD") dispatch(t.action);
        const fires = helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD" || helper === "PRESS_AND_HOLD_UNTIL_RELEASE";
        const event = fires && id >= 0 ? {kind: t.tier === "long" ? 8 : 7, thing: id, owners: [owner], slot: t.tier === "long" ? 1 : 0, outcome} : null;
        if (helper === "TAP_AT_HOLD_THRESHOLD" || helper === "REPEAT_WHILE_HELD") pulse = {at: start + t.at, state: t.tier, outcome, branch: count};
        add(start + t.at, `${state === "tap" ? "Tap candidate settled" : t.tier === "long" ? "Long hold" : "Hold"} · ${t.at} ms`, `${t.action.label || t.action.action} · ${helperWord(model, t.tier, helper ?? "")}${helper === "REPEAT_WHILE_HELD" ? ` at ${t.action.repeatHz} Hz; repeats are not enumerated` : ""}${helper === "TAP_ON_RELEASE_AFTER_HOLD" || helper === "TAP_SENDS" ? "; waits for release" : "; active at threshold"}${helper === "TAP_ON_RELEASE_AFTER_HOLD" && registeredCode !== null ? ["layer-goto", "layer-toggle", "mode-lock"].includes(classifyGestureAction(model, registeredCode).kind) ? ". The previous press-only state persists, including after release." : ". The previous held action stays active until release." : ""}`, state, phases, event, outcome, flashing);
        const next = thresholds[thresholds.indexOf(t) + 1]?.at;
        if (next !== undefined && Number.isInteger(flash) && flash > 0 && t.at + flash < next) {
            add(start + t.at + flash - 1, "Before feedback half-period", "The same held output and feedback projection, just before its configured half-period.", state, phases, null, outcome, flashing);
            add(start + t.at + flash, "Next feedback half-period", "Delegated layer/mode Painting stays steady; ordinary registered key and repeat feedback may blink.", state, phases, null, outcome, flashing);
        }
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
        const persistent = registeredCode !== null && ["layer-goto", "layer-toggle", "mode-lock"].includes(classifyGestureAction(model, registeredCode).kind);
        releaseRegistered();
        if (firesOnRelease) {dispatch(tier);pulse = {at: end, state: branch.longHold ? "long" : "hold", outcome, branch: count};}
        physicallyPressed = false;
        add(end, "Release", firesOnRelease ? `Sends ${tier.action} on release.` : persistent ? "Releases the physical key; the native layer/mode lock persists. No additional threshold event." : "Ends the held action; no additional threshold event.", null, [], firesOnRelease && id >= 0 ? {kind: branch.longHold ? 8 : 7, thing: id, owners: [owner], slot: branch.longHold ? 1 : 0, outcome} : null);
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
 * @param {{observation: Observation; blinkAt: number; effects?: import("./lighting-simulator-types.js").Event[]}[]} steps @param {number | undefined} flash @returns {Observation[]} */
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
        for (const event of step.effects ?? []) history.push({situation: step.observation.situation, event});
        history.push(step.observation);
    }
    return history;
}
