// The demo, as the model carries it (`model.demo`, core/session/demo-session.js):
// Ark's own draft over a demo profile, with no keyboard behind it. The panel
// never decides what the demo may do; it reads it here and posts these.

const NONE = {active: false, offered: false, name: null, fileName: null, unsaved: false, applyNeedsKeyboard: ""};

export const demoOf = (model) => ({...NONE, ...model?.demo});

// The messages the demo's controls post. They are for the host, not the draft.
export const openDemo = () => ({type: "openDemo"});
export const openDemoProfile = () => ({type: "openDemoProfile"});
export const leaveDemo = () => ({type: "leaveDemo"});

// What the panel says in the demo.
export const DEMO_WORDS = Object.freeze({
    status: "Demo · no keyboard",
    banner: "This is a demo. No keyboard is connected, so nothing here reaches one. Edits stay in this window; Export saves them as a profile file.",
    explore: "Explore a demo",
    exploreTip: "Open Ark on a demo setup, with no keyboard. Every screen works and every edit shows in the review; only Apply needs a keyboard.",
    exportNote: "Save the demo setup, with your edits, as a complete profile file. On your keyboard, Import it to review and apply it.",
});

// Leaving the demo, or opening another file in it, loses edits not exported
// since. Such a message asks first: `ask` holds what the question says, and
// the message to post once it is confirmed. Anything else posts as it is.
export function leaving(model, message) {
    const demo = demoOf(model);
    if (!demo.active || !demo.unsaved) return {ask: null, message};
    const changes = model?.draft?.changes?.length || 0;
    const count = `${changes} change${changes === 1 ? "" : "s"}`;
    const replacing = message.type === "openDemoProfile";
    const them = changes === 1 ? "it" : "them";
    return {
        ask: {
            title: replacing ? "Open another profile file?" : "Leave the demo?",
            detail: `Your ${count} in the demo ${changes === 1 ? "has" : "have"} not been exported. ${replacing ? "Opening another file replaces" : "Leaving loses"} ${them}; Export saves ${them} as a profile file first.`,
            confirm: replacing ? "Open without exporting" : "Leave without exporting",
        },
        message: {...message, discardDemo: true},
    };
}
