"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {document} = require("../fixtures/portable-profile");
const {connectedService} = require("../fixtures/connected-service");
const {writableKeyboard} = require("../fixtures/writable-keyboard");
const {decodeProfileBlob, encodeProfileBlob} = require("../../core/schema/profile-blob-v1");
const {decodeLightingDomain, encodeLightingDomain} = require("../../core/schema/lighting-domain-v1");
const {decodeLightingCapabilities} = require("../../core/protocol/lighting-capabilities-v1");
const {fingerprint, validateSnapshot} = require("../../core/model/portable-profile");
const {editDeviceProfile} = require("../../core/model/device-profile-edits");
const {ruleIdentity} = require("../../core/model/lighting-editor");
const {buildSnapshotModel} = require("../../core/session/device-model");
const {ProfileDraftSession} = require("../../core/session/profile-draft-session");
const vectors = require("../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json");
const rgbBytes = doc => decodeProfileBlob(Buffer.from(doc.profile,"base64")).domains.find(d=>d.id===16).payload;

test("unknown rules remain read-only and byte-exact through fake-device Apply, readback and backup", async t => {
    const pages = vectors.capability.map(h=>Buffer.from(h,"hex"));
    // Paint id 200 in the upper bitmap page, with opaque parameters.
    pages[6][11] |= 1;
    const caps = decodeLightingCapabilities(pages), source = document();
    const blob = decodeProfileBlob(Buffer.from(source.profile,"base64")), rgbDomain = blob.domains.find(d=>d.id===16);
    const rgb = decodeLightingDomain(rgbDomain.payload);
    const opaque = rgb.rules[1].parts.find(p=>p.slot===3);opaque.kind=200;opaque.params=[7,0,255];
    rgbDomain.payload = encodeLightingDomain(rgb,{capabilities:caps});
    source.profile=encodeProfileBlob(blob).toString("base64");
    const raw = rgbBytes(source);
    const keyboard = writableKeyboard({document:source,lightingPages:pages});
    const {service} = await connectedService(t,{keyboard},{sleep:async()=>{}});
    const read = await service.readPortableProfile();
    const draft = new ProfileDraftSession(read,"test",service.capabilities);
    const view=buildSnapshotModel(draft.current,service.capabilities,{editable:true,reason:""});
    assert.equal(view.rgb.lighting.rules[1].readOnly,true);
    assert.deepEqual(rgbBytes(JSON.parse(JSON.stringify(read.document))),raw);
    const target=structuredClone(read.document);target.layers[0][0]^=1;
    let recovery;
    const saved=await service.restorePortableProfile(target,{expectedFingerprint:read.fingerprint,saveRecovery:async doc=>{recovery=doc;return "/fake-recovery";}});
    assert.deepEqual(rgbBytes(saved.document),raw);assert.deepEqual(rgbBytes(recovery),raw);
    assert.deepEqual(rgbBytes((await service.readPortableProfile()).document),raw);
    assert.throws(()=>editDeviceProfile(Buffer.from(source.profile,"base64"),{type:"editLightingRule",index:1,expectedRule:ruleIdentity(rgb.rules[1]),action:"toggle"},{capabilities:service.capabilities}),/read-only/);
});

test("restore converts a current-schema v4 backup before staging or recovery writes", async t=>{
    const source=document(),keyboard=writableKeyboard({document:source});
    const {service}=await connectedService(t,{keyboard},{sleep:async()=>{}});
    const read=await service.readPortableProfile(), target=structuredClone(read.document);
    const blob=decodeProfileBlob(Buffer.from(target.profile,"base64"));
    blob.domains[0]={id:16,version:4,payload:Buffer.from(vectors.conversion[0].v4,"hex")};
    target.profile=encodeProfileBlob(blob,{domainVersions:{16:4,32:2,48:3,64:7,80:3}}).toString("base64");target.layers[0][0]^=1;
    const saved=await service.restorePortableProfile(target,{expectedFingerprint:fingerprint(source),saveRecovery:async()=>"/fake-recovery"});
    assert.equal(rgbBytes(saved.document).toString("hex"),vectors.conversion[0].hex);
    assert.equal(validateSnapshot(saved.document).rgb.formatVersion,5);
    assert.notEqual(saved.fingerprint,read.fingerprint);
});

test("working-memory rejection precedes recovery/candidate writes while keeping imported bytes", async t=>{
 const source=document(),{service}=await connectedService(t,{keyboard:writableKeyboard({document:source})},{sleep:async()=>{}});
 const read=await service.readPortableProfile(),target=structuredClone(read.document),blob=decodeProfileBlob(Buffer.from(target.profile,'base64'));
 const fixture=vectors.workingMemory.find(v=>v.name==='one-more-named-overbudget');blob.domains.find(d=>d.id===16).payload=Buffer.from(fixture.hex,'hex');target.profile=encodeProfileBlob(blob).toString('base64');
 const draft=new ProfileDraftSession(read,'test',service.capabilities);draft.replace(target,draft.revision,"import");
 assert.equal(draft.hasBlockers(),true);assert.deepEqual(rgbBytes(draft.document),Buffer.from(fixture.hex,'hex'));
 let recovery=false;await assert.rejects(()=>service.restorePortableProfile(target,{saveRecovery:async()=>{recovery=true;return '/fake';}}),e=>e.code==='LIGHTING_WORKING_CAPACITY');assert.equal(recovery,false);
 assert.deepEqual(rgbBytes((await service.readPortableProfile()).document),rgbBytes(source));
});

test("unknown enabled timing survives import, backup, owner/layer rewrites and Undo but cannot write", async t=>{
 const {lightingPages}=require('../fixtures/lighting-capabilities'),pages=lightingPages();pages[7][5]|=128; // timing31
 const keyboard=writableKeyboard({document:document(),lightingPages:pages}),{service}=await connectedService(t,{keyboard},{sleep:async()=>{}});
 const read=await service.readPortableProfile(),target=structuredClone(read.document),blob=decodeProfileBlob(Buffer.from(target.profile,'base64'));
 const domain=blob.domains.find(d=>d.id===16),p=decodeLightingDomain(domain.payload);
 p.rules=[{flags:0,brightness:177,parts:[{slot:0,kind:1,params:[2]},{slot:2,kind:0,params:[]},{slot:3,kind:0,params:[]},{slot:5,kind:31,params:[7,0,255]}]}];p.extensions=[];
 p.things=[];domain.payload=encodeLightingDomain(p,{capabilities:service.capabilities.lighting});target.profile=encodeProfileBlob(blob).toString('base64');
 const raw=rgbBytes(target),draft=new ProfileDraftSession(read,'test',service.capabilities);draft.replace(target,draft.revision,'import');
 assert.equal(draft.hasBlockers(),true);assert.match(draft.checks().find(f=>f.kind==='lightingWorkingMemory').detail,/unknown/);
 assert.equal(buildSnapshotModel(draft.current,service.capabilities,{editable:true,reason:''}).rgb.lighting.rules[0].readOnly,true);
 assert.deepEqual(rgbBytes(validateSnapshot(JSON.parse(JSON.stringify(draft.document))).document),raw);
 const order=target.layers.map((_,i)=>i);[order[1],order[2]]=[2,1];
 const reordered=require('../../core/model/portable-profile').reorderLayers(draft.document,order);
 assert.deepEqual(rgbBytes(reordered),raw,'opaque whole rule is not reinterpreted when layers move');
 require('../../core/model/lighting-references').rewriteLightingThings(blob,4,[1,0],{capabilities:service.capabilities.lighting});
 assert.deepEqual(blob.domains.find(d=>d.id===16).payload,raw,'owner rewrite preserves opaque whole rule');
 draft.undo(draft.revision);assert.deepEqual(rgbBytes(draft.document),rgbBytes(read.document));draft.redo(draft.revision);assert.deepEqual(rgbBytes(draft.document),raw);
 const before=keyboard.mutations.length;let recovery=false;
 await assert.rejects(()=>service.restorePortableProfile(draft.document,{saveRecovery:async()=>{recovery=true;return '/fake';}}),e=>e.code==='LIGHTING_WORKING_CAPACITY'&&/unknown/.test(e.message));
 assert.equal(recovery,false);assert.equal(keyboard.mutations.length,before,'no candidate or storage write');
});
test("complete read retains exact compiled lighting as snapshot metadata independently of the active draft",async t=>{
 const source=document(), keyboard=writableKeyboard({document:source}),{service}=await connectedService(t,{keyboard},{sleep:async()=>{}});
 const read=await service.readPortableProfile();assert.equal(typeof read.factoryLighting,'string');
 const draft=new ProfileDraftSession(read,'test',service.capabilities),model=buildSnapshotModel(draft.current,service.capabilities,{editable:true,reason:''});
 assert.equal(model.rgb.lighting.presets.find(p=>p.name==='standard').reason,undefined);
 assert.equal(require('../../core/schema/lighting-domain-v1').encodeLightingDomain(model.rgb.lighting.presets.find(p=>p.name==='standard').program).toString('base64'),read.factoryLighting);
 assert.equal('factoryLighting' in JSON.parse(JSON.stringify(draft.document)),false,'read metadata is not portable profile data');
 const revision=draft.revision;draft.stage({type:'replaceLightingPreset',preset:'minimal',expectedLighting:rgbBytes(draft.document).toString('base64'),replaceUnknown:false,draftRevision:revision});
 assert.equal(draft.current.factoryLighting,read.factoryLighting);assert.equal(keyboard.mutations.length,0,'preset stage makes no device write');
});
