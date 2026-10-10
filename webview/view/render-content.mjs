// Status belongs to the rail and commit bar. Everything else, including new
// model fields, invalidates the editor unless explicitly excluded here.
const editorContent = (model) => {
    const {diagnostics, apply, postApplyRead, load, device, host, portable, ...content} = model;
    return {...content, load: load && {...load, phase: undefined, operationId: undefined, operationBusy: undefined, progress: undefined},
        device: device && {...device, health: {...device.health, phase: undefined}},
        host: host && {...host, progress: undefined},
        portable: portable && {...portable, progress: undefined}};
};

export function sameEditorContent(before, after) {
    return Boolean(before && after && JSON.stringify(editorContent(before)) === JSON.stringify(editorContent(after)));
}
