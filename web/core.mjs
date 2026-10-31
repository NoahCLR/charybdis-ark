// @ts-check
// What the web shell needs from core/, as one module: the web build bundles
// this file (scripts/build-web.js) and the page imports the bundle.
//
// It exports what a reader of it uses: the shell (web-shell.mjs,
// recoveries.mjs), and the build's own tests, which run the bundled codecs and
// a draft against Node's (browser-tests/core-exercise.js). Exporting more is a
// line here, and a name in tests/scripts/web-build.test.js. The codecs come as
// namespaces, so a name two modules share stays reachable under each.

export {openPanelLoop} from "../core/session/panel-loop.js";
export {recoveryFileName} from "../core/session/recovery-copy.js";
export {WebHidDeviceAdapter} from "../core/transport/webhid-adapter.js";
export {FILE_MAX_BYTES, FILE_TOO_LARGE} from "../core/model/portable-profile.js";

// What the build's tests stage a draft and build the panel model with, and
// the progress they report through it.
export {ProfileDraftSession} from "../core/session/profile-draft-session.js";
export {ApplyProgress} from "../core/session/apply-progress.js";
export {buildPanelModel, startLayerEdit} from "../core/session/panel-session.js";

import * as portable from "../core/model/portable-profile.js";
export {portable};
import * as profileBlob from "../core/schema/profile-blob-v1.js";
export {profileBlob};
import * as rgbDomain from "../core/schema/rgb-domain-v1.js";
export {rgbDomain};
import * as keyBehaviorDomain from "../core/schema/key-behavior-domain-v1.js";
export {keyBehaviorDomain};
import * as comboDomain from "../core/schema/combo-domain-v1.js";
export {comboDomain};
import * as settingsDomain from "../core/schema/settings-domain-v1.js";
export {settingsDomain};
import * as pdModeDomain from "../core/schema/pd-mode-domain-v1.js";
export {pdModeDomain};

// The Buffer core/ runs on: Node's own under Node, the `buffer` package in the
// bundle (web/buffer.mjs). The build's tests read the bytes they compare with
// it.
const NodeOrBundledBuffer = Buffer;
export {NodeOrBundledBuffer as Buffer};
