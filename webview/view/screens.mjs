// @ts-check
// The rail, screen renderer and message receiver share one screen definition.
// Render functions are supplied by the app: this registry stays pure and does
// not import screens, the frame or their state.

/** @typedef {import("../../contracts/model.js").StatusModel} StatusModel */
/** @typedef {{screenKeys: () => HTMLElement, screenLighting: () => HTMLElement, screenMacros: () => HTMLElement,
 * screenCustomKeys: () => HTMLElement, screenPointing: () => HTMLElement, screenBehaviours: () => HTMLElement,
 * screenCombos: () => HTMLElement, screenPointer: () => HTMLElement, screenHost: () => HTMLElement,
 * screenProfile: () => HTMLElement, screenDevice: () => HTMLElement}} ScreenRenderers */
/** @typedef {keyof typeof SCREENS} ScreenId */
/** @typedef {{label: string, group: string, icon: string, title: string, keepOnPublish: boolean,
 * available: (model: StatusModel) => boolean, render: (renderers: ScreenRenderers) => HTMLElement,
 * secondaryLabel?: string, unavailable?: {title: string, detail: string}}} ScreenDefinition */

/** @param {StatusModel | null | undefined} model */
export const configureReady = (model) => model?.load?.state === "ready";

/** @template {ScreenDefinition} T @param {T} definition @returns {Readonly<T>} */
const screen = (definition) => Object.freeze(definition);

export const SCREENS = Object.freeze({
    keys: screen({
        label: "Keymap", group: "Configure", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6"/></svg>',
        available: configureReady, render: renderers => renderers.screenKeys(),
    }),
    lighting: screen({
        label: "Lighting", group: "Configure", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><path d="M8 1.8v1.6M13 3l-1.1 1.1M14.2 8h-1.6M3 13l1.1-1.1M2 8h1.6M3 3l1.1 1.1"/><circle cx="8" cy="8.4" r="3.2"/></svg>',
        available: configureReady, render: renderers => renderers.screenLighting(),
    }),
    macros: screen({
        label: "Macros", group: "Configure", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h9"/></svg>',
        available: configureReady, render: renderers => renderers.screenMacros(),
    }),
    customKeys: screen({
        label: "Custom keys", group: "Configure", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 8h5M8 5.5v5"/></svg>',
        available: configureReady, render: renderers => renderers.screenCustomKeys(),
    }),
    pointing: screen({
        label: "Pointing modes", group: "Configure", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11M2.5 8h11"/></svg>',
        available: configureReady, render: renderers => renderers.screenPointing(),
    }),
    // Settings: what applies to the whole keyboard, a screen per subject,
    // every section shown open.
    behaviours: screen({
        label: "Behaviours", group: "Settings", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5M6.5 1.5h3"/></svg>',
        available: configureReady, render: renderers => renderers.screenBehaviours(),
    }),
    combos: screen({
        label: "Combos", group: "Settings", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="8.5" y="4.5" width="6" height="6" rx="1.5"/><path d="M4.5 13h7"/></svg>',
        available: configureReady, render: renderers => renderers.screenCombos(),
    }),
    pointer: screen({
        label: "Pointer settings", group: "Settings", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="4" y="1.5" width="8" height="13" rx="4"/><path d="M8 1.5v4.5"/></svg>',
        available: configureReady, render: renderers => renderers.screenPointer(),
    }),
    host: screen({
        label: "Host", group: "Settings", title: "Keyboard", keepOnPublish: true,
        icon: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5"/><path d="M5.5 14h5M8 11v3"/></svg>',
        available: configureReady, render: renderers => renderers.screenHost(),
    }),
    profile: screen({
        label: "Backups", group: "Keyboard", title: "Backups", keepOnPublish: false,
        secondaryLabel: "Backups",
        icon: '<svg viewBox="0 0 16 16"><path d="M8 1.8v8.4M5 7.4 8 10.4l3-3M2.8 12.2v1.4h10.4v-1.4"/></svg>',
        available: model => Boolean(model.portable?.available), render: renderers => renderers.screenProfile(),
        unavailable: {title: "Backups unavailable", detail: "Connect a keyboard with complete-profile firmware, then read it to manage backups."},
    }),
    device: screen({
        label: "Keyboard", group: "Keyboard", title: "Keyboard", keepOnPublish: false,
        secondaryLabel: "Keyboard",
        icon: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M6 6.5h4v3H6z"/></svg>',
        available: model => Boolean(model.device?.connected || model.demo?.active), render: renderers => renderers.screenDevice(),
        unavailable: {title: "Device status unavailable", detail: "Read the keyboard to see its connection and diagnostics."},
    }),
});

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
