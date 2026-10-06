// What a browser host needs from core/, as one module: the web build bundles
// this file (scripts/build-web.js) and the page imports the bundle. It is a
// build entry, not part of the extension, which requires core/ directly.
//
// Exporting more is a line here. The codecs come as namespaces, so a name two
// modules share stays reachable under each.

export {
    ProfileDeviceService,
    PROFILE_DOMAIN_FLAGS,
    REQUIRED_PROFILE_DOMAIN_MASK,
    REQUIRED_LIVE_MUTATION_FEATURES,
    evaluateProfileCompatibility,
    evaluateLiveMutationCompatibility,
} from "../core/session/profile-device-service.js";
export {ProfileDraftSession, DRAFT_EDITS} from "../core/session/profile-draft-session.js";
export {
    DRAFT_CONTROLS,
    PORTABLE_MESSAGES,
    applyLayerEdit,
    buildPanelModel,
    discardDraftForDevice,
    layerEditDocument,
    observePortable,
    routeMessage,
    startLayerEdit,
    takeOutbox,
} from "../core/session/panel-session.js";
export {readKeyboard, draftControl, portableControl, rereadKeyboard} from "../core/session/panel-controls.js";
export {exportedProfile, openPanelLoop} from "../core/session/panel-loop.js";
export {upgradePdSnapshot, validateSnapshot} from "../core/session/portable-profile-session.js";
export {APPLY_STEPS, ApplyProgress, failureReason} from "../core/session/apply-progress.js";
export {DEFAULT_REQUEST_TIMEOUT_MS, DeviceRequestCoordinator} from "../core/transport/request-coordinator.js";
export {
    LIVE_LINK_ERROR_CODES,
    LiveLinkTransportError,
    RAW_HID_REPORT_SIZE,
    assertDeviceAdapter,
    liveLinkError,
    normalizeDeviceDescriptors,
    normalizeRawHidReport,
} from "../core/transport/device-adapter.js";
export {WEBHID_DEVICE_FILTERS, WebHidDeviceAdapter} from "../core/transport/webhid-adapter.js";
export {VOCABULARY, word, layerName} from "../core/model/vocabulary.js";

export * as portable from "../core/model/portable-profile.js";
export * as actions from "../core/schema/actions.js";
export * as profileBlob from "../core/schema/profile-blob-v1.js";
export * as rgbDomain from "../core/schema/rgb-domain-v1.js";
export * as keyBehaviorDomain from "../core/schema/key-behavior-domain-v1.js";
export * as comboDomain from "../core/schema/combo-domain-v1.js";
export * as settingsDomain from "../core/schema/settings-domain-v1.js";
export * as pdModeDomain from "../core/schema/pd-mode-domain-v1.js";
export * as keycodes from "../core/data/keycode-catalog.js";

// The Buffer core/ runs on: Node's own under Node, the `buffer` package in the
// bundle (web/buffer.mjs). A host turns device bytes into one with it.
const NodeOrBundledBuffer = Buffer;
export {NodeOrBundledBuffer as Buffer};
