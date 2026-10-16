import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {classifyGestureAction} from '../../webview/view/lighting-action.mjs';
const require=createRequire(import.meta.url);
const {buildSnapshotModel}=require('../../core/session/device-model');
const {demoProfile,demoSnapshot,DEMO_CAPABILITIES}=require('../../core/session/demo-session');
const m=buildSnapshotModel(demoSnapshot(demoProfile()),DEMO_CAPABILITIES,{editable:true});
test('unobservable nested/one-shot policies and empty actual mode bindings cannot acquire local ownership',()=>{
 for(const code of [0x5282,0x4328,0x5021,0x7700]){const a=classifyGestureAction(m,code);assert.equal(a.kind,'conditional');assert.ok(a.reason);}
 const empty=m.pdModes.find(s=>!s.kind);assert.ok(empty);for(const code of [empty.binding.holdCode,empty.binding.lockCode]){assert.equal(classifyGestureAction(m,code).kind,'conditional');assert.match(classifyGestureAction(m,code).reason,/empty/);}
});
