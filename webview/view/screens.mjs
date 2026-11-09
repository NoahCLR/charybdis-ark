// @ts-check
// The rail, screen renderer and message receiver share one screen definition.
// Render functions are supplied by the app: this registry stays pure and does
// not import screens, the frame or their state. A screen's label is its rail
// button and its page title, so a screen waiting for a keyboard is titled as
// the rail item it highlights.

/** @typedef {import("../../contracts/model.js").StatusModel} StatusModel */
/** @typedef {{screenKeys: () => HTMLElement, screenLighting: () => HTMLElement, screenMacros: () => HTMLElement, screenAutocorrect: () => HTMLElement,
 * screenCustomKeys: () => HTMLElement, screenPointing: () => HTMLElement, screenBehaviours: () => HTMLElement,
 * screenCombos: () => HTMLElement, screenPointer: () => HTMLElement, screenHost: () => HTMLElement,
 * screenProfile: () => HTMLElement, screenDevice: () => HTMLElement}} ScreenRenderers */
/** @typedef {keyof typeof SCREENS} ScreenId */
/** @typedef {{label: string, group: string, icon: string, keepOnPublish: boolean,
 * available: (model: StatusModel) => boolean, render: (renderers: ScreenRenderers) => HTMLElement,
 * secondaryLabel?: string, unavailable?: {title: string, detail: string}}} ScreenDefinition */

/** @param {StatusModel | null | undefined} model */
export const configureReady = (model) => model?.load?.state === "ready";

/** @template {ScreenDefinition} T @param {T} definition @returns {Readonly<T>} */
const screen = (definition) => Object.freeze(definition);

export const SCREENS = Object.freeze({
    // A keyboard: a row of keys over a space bar. The keys are filled squares,
    // as a stroke that short draws nothing.
    keys: screen({
        label: "Keymap", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><g fill="currentColor" stroke="none"><rect x="3.6" y="5.6" width="1.5" height="1.5" rx=".35"/><rect x="5.9" y="5.6" width="1.5" height="1.5" rx=".35"/><rect x="8.2" y="5.6" width="1.5" height="1.5" rx=".35"/><rect x="10.5" y="5.6" width="1.5" height="1.5" rx=".35"/></g><path d="M5 9.8h6"/></svg>',
        available: configureReady, render: renderers => renderers.screenKeys(),
    }),
    // A key backlight: a lit key with five rays fanned 36° apart above it,
    // mirrored about the centre and centred in the box, round caps included.
    lighting: screen({
        label: "Lighting", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16" stroke-linecap="round"><path d="M4.9 11.5h6.2M12.66 9.99l2-.65M10.88 7.54l1.23-1.7M8 6.6V4.5M5.12 7.54 3.89 5.84M3.34 9.99l-2-.65"/></svg>',
        available: configureReady, render: renderers => renderers.screenLighting(),
    }),
    // A robot: a macro does the typing for you. Its eyes and antenna tip are
    // filled, as an outline circle that small closes up.
    macros: screen({
        label: "Macros", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="3" y="5" width="10" height="8.5" rx="2"/><path d="M8 5V2.8M1.5 8v2.5M14.5 8v2.5"/><g fill="currentColor" stroke="none"><circle cx="8" cy="2.2" r="1.1"/><circle cx="6" cy="9" r="1.05"/><circle cx="10" cy="9" r="1.05"/></g></svg>',
        available: configureReady, render: renderers => renderers.screenMacros(),
    }),
    // A word struck through and set right: a line of text, a stroke across
    // it and a tick beside it.
    autocorrect: screen({
        label: "Autocorrect", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h8M2 10.5h5.5M3.5 3.5l5 4"/><path d="M9.5 10.8l1.8 1.8 3.2-4"/></svg>',
        available: configureReady, render: renderers => renderers.screenAutocorrect(),
    }),
    customKeys: screen({
        label: "Custom keys", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 8h5M8 5.5v5"/></svg>',
        available: configureReady, render: renderers => renderers.screenCustomKeys(),
    }),
    pointing: screen({
        label: "Pointing modes", group: "Configure", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11M2.5 8h11"/></svg>',
        available: configureReady, render: renderers => renderers.screenPointing(),
    }),
    // Settings: what applies to the whole keyboard, a screen per subject,
    // every section shown open.
    behaviours: screen({
        label: "Behaviours", group: "Settings", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/></svg>',
        available: configureReady, render: renderers => renderers.screenBehaviours(),
    }),
    combos: screen({
        label: "Combos", group: "Settings", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="8.5" y="4.5" width="6" height="6" rx="1.5"/><path d="M4.5 13h7"/></svg>',
        available: configureReady, render: renderers => renderers.screenCombos(),
    }),
    pointer: screen({
        label: "Pointer", group: "Settings", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="4" y="1.5" width="8" height="13" rx="4"/><path d="M8 1.5v4.5"/></svg>',
        available: configureReady, render: renderers => renderers.screenPointer(),
    }),
    host: screen({
        label: "Host", group: "Settings", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M5.5 14h5M8 11v3"/></svg>',
        available: configureReady, render: renderers => renderers.screenHost(),
    }),
    profile: screen({
        label: "Backups", group: "Keyboard", keepOnPublish: false,
        secondaryLabel: "Backups",
        icon: '<svg viewBox="0 0 16 16"><path d="M8 1.8v8.4M5 7.4 8 10.4l3-3M2.8 12.2v1.4h10.4v-1.4"/></svg>',
        available: model => Boolean(model.portable?.available), render: renderers => renderers.screenProfile(),
        unavailable: {title: "Backups unavailable", detail: "Connect a keyboard with complete-profile firmware, then read it to manage backups."},
    }),
    device: screen({
        label: "Keyboard", group: "Keyboard", keepOnPublish: false,
        secondaryLabel: "Keyboard",
        icon: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M6 6.5h4v3H6z"/></svg>',
        available: model => Boolean(model.device?.connected || model.demo?.active), render: renderers => renderers.screenDevice(),
        unavailable: {title: "Keyboard status unavailable", detail: "Read the keyboard to see its connection and diagnostics."},
    }),
});
// Each kind of thing a key reaches (key-identity.mjs reachKind) by its
// screen's rail icon: what the board draws on a key that reaches one, and a
// macro's or a custom key's mark wherever one is named.
/** @type {Readonly<Record<import("./key-identity.mjs").ReachKind, string>>} */
export const REACH_ICONS = Object.freeze({macro: SCREENS.macros.icon, customKey: SCREENS.customKeys.icon, pointing: SCREENS.pointing.icon});


/** @param {unknown} id @returns {id is ScreenId} */
export const isScreenId = (id) => typeof id === "string" && Object.hasOwn(SCREENS, id);

/** @param {unknown} id @returns {ScreenDefinition | null} */
export const screenDefinition = (id) => isScreenId(id) ? SCREENS[id] : null;

/** @param {StatusModel | null | undefined} model @param {unknown} id */
export function screenAvailable(model, id) {
    if (!model || model.load?.state === "loading") return false;
    return Boolean(screenDefinition(id)?.available(model));
}

// Object insertion order is the authored rail order; no second ID list exists.
export function screenGroups() {
    /** @type {Map<string, {id: ScreenId, definition: ScreenDefinition}[]>} */
    const groups = new Map();
    for (const id of /** @type {ScreenId[]} */ (Object.keys(SCREENS))) {
        const definition = SCREENS[id];
        const items = groups.get(definition.group) || [];
        items.push({id, definition});
        groups.set(definition.group, items);
    }
    return [...groups].map(([group, items]) => ({group, items}));
}

// Unavailable Configure and Settings screens offer the first available
// keyboard surface; profile backups precede diagnostics, in the same order as
// the rail.
/** @param {StatusModel | null | undefined} model @param {unknown} current */
export function secondaryScreen(model, current) {
    for (const id of /** @type {ScreenId[]} */ (Object.keys(SCREENS))) {
        const definition = screenDefinition(id);
        if (id !== current && definition?.secondaryLabel && screenAvailable(model, id)) {
            return {screen: id, label: definition.secondaryLabel};
        }
    }
    return null;
}
