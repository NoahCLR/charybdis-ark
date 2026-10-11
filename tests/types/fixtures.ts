import type {PortableDocument, SnapshotFacts} from '../../core/model/types.js';
import type {DeviceAdapter, RequestConnection} from '../../core/transport/types.js';
import type {SettingsDomain} from '../../core/schema/types.js';
import {fakeKeyboard, fakeKeyboardAdapter} from '../fixtures/fake-keyboard.js';
import {compiled, document, settings} from '../fixtures/portable-profile.js';
import {document32} from '../fixtures/pd-slots-32.js';
import {hostMacros} from '../fixtures/host-macros.js';
import {options} from '../fixtures/keyboard-options.js';
import {payloadDevice} from '../fixtures/profile-payload.js';

const portable: PortableDocument = document();
const compiledProfile: PortableDocument = compiled();
const pointingProfile: PortableDocument = document32();
const policy: SettingsDomain = settings();
const snapshotFacts: SnapshotFacts = {options: options()};
const macroProfile: PortableDocument = hostMacros(0, ['hello']).snapshot.document;
const keyboard = fakeKeyboard({document: portable});
const adapter: DeviceAdapter = fakeKeyboardAdapter({document: portable});
const injectedAdapter: DeviceAdapter = fakeKeyboardAdapter({keyboard});
const payloadConnection: RequestConnection = payloadDevice({bytes: Buffer.alloc(100), generation: 1});

// @ts-expect-error A simulated keyboard requires a complete portable document.
fakeKeyboard({});
// @ts-expect-error Constructing an adapter needs a document or an existing keyboard.
fakeKeyboardAdapter({});
// @ts-expect-error Macro payloads use the schema's source strings, not encoded bytes.
hostMacros(0, [Buffer.alloc(1)]);
// @ts-expect-error A profile payload's metadata requires its generation.
payloadDevice({bytes: Buffer.alloc(1)});

void [compiledProfile, pointingProfile, policy, snapshotFacts, macroProfile, adapter, injectedAdapter, payloadConnection];
