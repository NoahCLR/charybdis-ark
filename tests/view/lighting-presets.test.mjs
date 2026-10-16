import test from 'node:test';import assert from 'node:assert/strict';import {createRequire}from'node:module';
import {LightingSimulator,KEY_LEDS}from'../../webview/view/lighting-simulator.mjs';
const require=createRequire(import.meta.url),{lightingPreset}=require('../../core/model/lighting-presets'),{decodeLightingDomain}=require('../../core/schema/lighting-domain-v1'),{lightingCapabilities}=require('../fixtures/lighting-capabilities');
const factory=Buffer.from(require('../../upstream/firmware/tests/fixtures/lighting_vectors_v1.json').conversion.find(c=>c.name==='standard').hex,'hex');
function fixture(){const p=decodeLightingDomain(factory);p.palette=[{h:0,s:255,v:200},{h:85,s:255,v:200},{h:170,s:255,v:200},{h:0,s:0,v:0}];p.things=[{kind:1,default:[0,255],records:[[0,255],[0,0],[0,1]]},{kind:3,default:[4,2],records:[[254,254],[254,1]]}];return p;}
test('Teaching paints passive native layer keys and enabled/layer-qualified combo inputs with deterministic priorities',()=>{
 const p=lightingPreset(fixture(),factory,[{enabled:true},{enabled:true}],{capabilities:lightingCapabilities()},'teaching').program;
 const situation={layers:[0],keymap:{0:{0:{code:0x5221},1:{code:4},2:{code:0x5222},3:{code:1}}},queryCombos:{0:{enabled:true,layers:[0],inputs:[0x5221,4]},1:{enabled:true,layers:[0],inputs:[0x5221,0x5222]}}};
 let frame=new LightingSimulator(p).render(situation);assert.deepEqual(frame[KEY_LEDS[0]],[0,0,200],'combo zero wins over combo one and layer hint');assert.deepEqual(frame[KEY_LEDS[2]],[0,200,0]);assert.equal(frame[KEY_LEDS[3]],null,'transparent native input is not resolved into a direct action');
 situation.queryCombos[0].layers=[1];situation.queryCombos[1].enabled=false;frame=new LightingSimulator(p).render(situation);assert.deepEqual(frame[KEY_LEDS[0]],[200,0,0],'without qualifying combos the actual target layer colour shows');
 assert.deepEqual(frame[KEY_LEDS[2]],[0,200,0]);
});
test('Teaching keeps real black opaque and copies are stable when current combo identity changes',()=>{
 const current=fixture();current.things[1].default[1]=3;const p=lightingPreset(current,factory,[{enabled:true}],{capabilities:lightingCapabilities()},'teaching').program;
 const s={keymap:{0:{0:{code:0x5221}}},queryCombos:{0:{enabled:true,layers:[0],inputs:[0x5221]}}};
 assert.deepEqual(new LightingSimulator(p).render(s)[0],[0,0,0]);p.things.find(t=>t.kind===3).default[1]=0;assert.deepEqual(new LightingSimulator(p).render(s)[0],[0,0,0]);
});
