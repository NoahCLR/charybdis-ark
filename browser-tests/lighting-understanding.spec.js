// @ts-check
"use strict";
const {test,expect}=require('@playwright/test');
const {openControls,clearPosts,posted,publishAccepted}=require('./control-preview');
const {decodeLightingDomain}=require('../core/schema/lighting-domain-v1');
const vectors=require('../upstream/firmware/tests/fixtures/lighting_vectors_v1.json');
const standard=vectors.conversion.find(v=>v.name==='standard');
const field=(page,id)=>page.locator(`[data-f="${id}"]`);
// Native checks generate these files from the installed host. CI keeps running
// every assertion against the repo's host-cascade fixture when none is installed.
async function installedHost(page,theme) {
 const fs=require('node:fs'),path=`preview/${theme}.html`;
 if(!fs.existsSync(path))return;
 const html=fs.readFileSync(path,'utf8'),style=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
 await page.route('**/understanding-host.css',route=>route.fulfill({contentType:'text/css',body:style}));await page.addStyleTag({url:'/preview/understanding-host.css'});
}
// Send the public edit builders through the real DEMO host, then wait for its
// accepted model. No injected decoded behaviour or local simulator state.
async function acceptedGestureDemo(page,theme,mode,persistent=null) {
 await page.goto('/dist/web/index.html');await page.evaluate(()=>{window.addEventListener('message',e=>{if(e.data?.type==='model')window.__gestureModel=e.data.model;});const api=window.acquireVsCodeApi(),post=api.postMessage.bind(api);window.__posted=[];api.postMessage=m=>{window.__posted.push(structuredClone(m));return post(m);};});
 await page.locator('[data-act="explore-demo"]').click();await expect(page.locator('.bench-tablist')).toBeVisible();await installedHost(page,theme);
 const wanted=theme==='vscode-dark'?'dark':'light';if(await page.locator('[data-act="theme"]').getAttribute('data-theme-now')!==wanted)await page.locator('[data-act="theme"]').click();await page.locator('body').evaluate((b,t)=>b.classList.add('vscode-body',t),theme);
 return page.evaluate(async ({mode,persistent})=>{
  const {saveBehaviour,lightingRule}=await import('/webview/view/edits.mjs'),api=window.acquireVsCodeApi();
  const send=edit=>new Promise(resolve=>{const m=window.__gestureModel,listener=e=>{if(e.data?.type==='model'&&e.data.model.draft?.revision>m.draft.revision){window.removeEventListener('message',listener);resolve();}};window.addEventListener('message',listener);api.postMessage({...edit,draftId:m.draft.id,draftRevision:m.draft.revision});});
  const row=window.__gestureModel.keyBehaviors.find(r=>r.keycode==='CUSTOM_KEY_0'),hold=persistent??(mode?window.__gestureModel.pdModes[0].binding.hold:'MO(2)');window.__posted=[];
  await send(saveBehaviour({...row,tapHoldTerm:'317',longerHoldTerm:'913',multiTapTerm:'89',steps:[{tapCount:0,tap:{helper:'TAP_SENDS',action:'KC_A'},hold:{helper:'PRESS_AND_HOLD_UNTIL_RELEASE',action:hold},...persistent?{}:{longHold:{helper:'TAP_ON_RELEASE_AFTER_HOLD',action:'KC_B'}}}]}, {}, window.__gestureModel.profileIdentity));
  const id=window.__gestureModel.keyBehaviors.findIndex(r=>r.keycode===row.keycode);
  for(const [kind,params,value]of [[null,[],0],[2,[2],200],[mode?3:1,[mode?0:2],80],[8,[id,12],200]]){
   await send(lightingRule(-1,'','add',{rule:{flags:0,brightness:255,parts:[...kind===null?[]:[{slot:0,kind,params}],{slot:2,kind:0,params:[]},{slot:3,kind:value?2:1,params:value?[0]:[]}]}}));
   if(value)await send(lightingRule(0,window.__gestureModel.rgb.lighting.rules[0].identity,'colour',{colour:{h:0,s:0,v:value}}));
  }
  return {key:row.keycode,id,seedPosts:window.__posted.map(m=>m.type)};
 },{mode,persistent});
}
for(const theme of ['vscode-dark','vscode-light']) {
 test(`Inspector selection, whole-rule counterfactual and matrix associations are local (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);await installedHost(page,theme);await clearPosts(page);
  await field(page,'inspector:led').selectOption('56');await expect(field(page,'inspector:led')).toHaveValue('56');
  await field(page,'inspector:key').selectOption('59');await expect(page.locator('.lighting-inspector')).toContainText('No LED result');
  await field(page,'inspector:key').selectOption('56');await expect(field(page,'inspector:led')).toHaveValue('55');
  await field(page,'inspector:clear-rule').selectOption('0');await expect(page.locator('[data-counterfactual]')).toContainText('including its background');
  await field(page,'inspector:clear-rule').selectOption('-1');await expect(page.locator('[data-counterfactual]')).toHaveCount(0);
  await page.locator('[data-sim-led="57"]').click();await expect(field(page,'inspector:led')).toHaveValue('57');
  await page.locator('[data-inspector-rule="0"] button').click();await expect(page.locator('.lighting-rule-editor h3')).toHaveText('Rule 1');
  expect(await posted(page)).toEqual([]);
  const p=decodeLightingDomain(Buffer.from(standard.hex,'hex'));p.rules[0].known=false;
  await publishAccepted(page,['rgb','lighting','program'],p);await expect(page.locator('.lighting-inspector')).toContainText('incomplete and read-only');await expect(page.locator('[data-sim-led]')).toHaveCount(0);
 });
 test(`gesture controls use effective row thresholds and post nothing (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);await installedHost(page,theme);
  const info=await page.evaluate(async()=>{
   const m=structuredClone((await import('/webview/store.mjs')).getModel());const i=m.keyBehaviors.findIndex(r=>r.steps.some(s=>s.hold&&s.longHold)&&Object.values(m.rgb.lighting.keymap).some(ks=>Object.values(ks).some(k=>k.code===r.code)));const r=m.keyBehaviors[i];r.tapHoldTerm='317';r.longerHoldTerm='913';r.multiTapTerm='89';m.participation=null;r.enabled=true;r.allowedLayers=65535;
   window.dispatchEvent(new MessageEvent('message',{data:{type:'model',model:m}}));return {i,key:r.keycode,count:r.steps.find(s=>s.hold&&s.longHold).tapCount+1};
  });
  await page.locator('[data-tool="gesture"]').click();await field(page,'gesture:behaviour').selectOption(String(info.i));
  const prefix=`gesture:${info.key}`;await field(page,`${prefix}:branch`).selectOption(String(info.count));
  await expect(page.locator('.lighting-gesture')).toContainText('Hold 317 ms');
  const options=await field(page,`${prefix}:step`).locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));
  const hold=options.find(o=>o.text.includes('Hold · 317'));expect(hold).toBeTruthy();await field(page,`${prefix}:step`).selectOption(hold.value);await expect(page.locator('[data-gesture-moment]')).toContainText('317 ms');
  const long=options.find(o=>o.text.includes('Long hold · 913'));expect(long).toBeTruthy();await field(page,`${prefix}:step`).selectOption(long.value);await expect(page.locator('[data-gesture-moment]')).toContainText('913 ms');
  await field(page,`${prefix}:path`).selectOption('1');await page.locator('[data-next-branch]').click();await page.locator('[data-inspect-gesture]').click();
  expect(await posted(page)).toEqual([]);
 });
 test(`overview isolates looks and all its navigation stays local (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);await installedHost(page,theme);await page.locator('[data-tool="overview"]').click();
  const tile=page.locator('[data-look="1:3"]');const before=await tile.locator('[data-colour]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-colour')));
  await field(page,'overview:layer').selectOption('4');await field(page,'overview:layer').selectOption('0');
  expect(await tile.locator('[data-colour]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-colour')))).toEqual(before);
  await expect(page.locator('[data-look="2:31"]')).toContainText('Empty');await expect(page.locator('[data-look="2:31"] [data-inspect-look]')).toBeDisabled();
  await clearPosts(page);await tile.locator('[data-inspect-look]').click();await expect(page.locator('.lighting-situation')).toContainText('0 ms');
  await tile.locator('[data-open-owner]').click();await expect(page.locator('.bench-tablist')).toBeVisible();expect(await posted(page)).toEqual([]);
 });
 test(`preset preview and opaque replacement guard do not silently post (${theme})`,async({page})=>{
  await page.goto(`/preview/index.html?host=demo&screen=lighting`);await installedHost(page,theme);await page.locator('[data-tool="presets"]').click();await clearPosts(page);
  for(const name of ['standard','minimal','teaching']) {await page.locator(`[data-preview-preset="${name}"]`).click();await expect(page.locator('[data-preset-led]')).toHaveCount(58);expect(await posted(page)).toEqual([]);}
  await expect(page.getByRole('region',{name:'Lighting presets'})).toContainText('Later identity edits do not update');
  await field(page,'preset:layer').selectOption('3');expect(await posted(page)).toEqual([]);
  await publishAccepted(page,['rgb','lighting','presets',2,'replacesUnknown'],true);await expect(page.locator('[data-keep-preset]')).toBeDisabled();
  await page.locator('[data-preview-preset="teaching"]').click();await expect(page.locator('[data-keep-preset]')).toBeDisabled();await field(page,'preset:replace-unknown').locator('..').click();await page.locator('[data-keep-preset]').click();
  expect(await posted(page)).toEqual([expect.objectContaining({type:'replaceLightingPreset',preset:'teaching',replaceUnknown:true,expectedLighting:expect.any(String)})]);
  await publishAccepted(page,['draft','editable'],false);await expect(page.locator('[data-keep-preset]')).toBeDisabled();
 });
 test(`real DEMO presets are one draft step with Undo, Redo, Review and export (${theme})`,async({page})=>{
  await page.goto('/dist/web/index.html');await page.locator('[data-act="explore-demo"]').click();await expect(page.locator('.bench-tablist')).toBeVisible();
  await installedHost(page,theme);
  const wanted=theme==='vscode-dark'?'dark':'light';if(await page.locator('[data-act="theme"]').getAttribute('data-theme-now')!==wanted)await page.locator('[data-act="theme"]').click();
  await page.locator('body').evaluate((b,t)=>b.classList.add('vscode-body',t),theme);
  await page.locator('[data-screen="lighting"]').click();await page.locator('[data-tool="presets"]').click();await page.locator('[data-preview-preset="teaching"]').click();await page.locator('[data-keep-preset]').click();
  await expect(page.locator('[data-act="undo"]')).toBeEnabled();await expect(page.locator('[data-preset-summary]')).toContainText('draft changed');
  await page.locator('[data-act="undo"]').click();await expect(page.locator('[data-act="redo"]')).toBeEnabled();await page.locator('[data-act="redo"]').click();
  await page.locator('.commit [data-act="review"]').click();const sheet=page.locator('.sheet');await expect(sheet).toContainText('Lighting');await expect(sheet.locator('[data-act="apply"]')).toHaveCount(0);
  const [download]=await Promise.all([page.waitForEvent('download'),sheet.locator('[data-act="export"]').click()]);const file=JSON.parse(Buffer.concat(await(await download.createReadStream()).toArray()).toString());
  const d=require('../core/model/portable-profile').validateSnapshot(file);expect(d.rgb.extensions).toEqual([]);const layerHint=d.rgb.rules.find(r=>r.parts.some(p=>p.slot===2&&p.kind===8&&p.params[0]===10));expect(layerHint.parts).toEqual([{slot:0,kind:9,params:[255,0]},{slot:2,kind:8,params:[10,255]},{slot:3,kind:9,params:[]}]);const comboHints=d.rgb.rules.filter(r=>r.parts.some(p=>p.slot===2&&p.kind===8&&p.params[0]===15));expect(comboHints.map(r=>r.parts[1].params[1])).toEqual([...comboHints.map(r=>r.parts[1].params[1])].sort((a,b)=>a-b));expect(comboHints.every(r=>r.parts[2].kind===2)).toBe(true);
  expect(file.layers).toEqual(require('../core/data/demo-profile.charybdis.json').layers);expect(file.macros).toEqual(require('../core/data/demo-profile.charybdis.json').macros);
 });
 test(`all 58 LED labels have bounds and contrast in empty, mixed and full boards (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);await installedHost(page,theme);
  const results=await page.evaluate(async()=>{
   const {lightingBoard}=await import('/webview/ui/lighting-board.mjs');const report=[];
   const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
   for(const kind of ['empty','mixed','full']){
    const frame=Array.from({length:58},(_,i)=>kind==='empty'||kind==='mixed'&&i%3===0?null:i%3===1?[255,255,255]:i%3===2?[0,0,0]:[255,0,180]);
    const board=lightingBoard(frame,'proof');document.body.append(board);const vb=board.viewBox.baseVal;
    const labels=[...board.querySelectorAll('[data-proof-label]')].map(n=>{const id=n.getAttribute('data-proof-label'),shape=board.querySelector(`[data-proof-led="${id}"]`),b=n.getBoundingClientRect(),q=shape.getBoundingClientRect(),bbox=n.getBBox(),bg=lum(rgb(getComputedStyle(shape).fill)),fg=lum(rgb(getComputedStyle(n).fill));return {id:Number(id),contrast:(Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05),inside:b.left>=q.left-1&&b.right<=q.right+1&&b.top>=q.top-1&&b.bottom<=q.bottom+1,inView:bbox.x>=vb.x&&bbox.y>=vb.y&&bbox.x+bbox.width<=vb.x+vb.width&&bbox.y+bbox.height<=vb.y+vb.height};});
    report.push({kind,labels});board.remove();
   }return report;
  });
  for(const result of results){expect(result.labels.map(l=>l.id).sort((a,b)=>a-b)).toEqual(Array.from({length:58},(_,i)=>i));for(const l of result.labels){expect(l.inside,`${result.kind} LED ${l.id} label bounds`).toBe(true);expect(l.inView).toBe(true);expect(l.contrast,`${result.kind} LED ${l.id} contrast`).toBeGreaterThanOrEqual(4.5);}}
 });
 test(`conditional gesture paths retain controls to recover and native source fields are wired (${theme})`,async({page})=>{
  await openControls(page,'lighting',{},theme);await installedHost(page,theme);
  const key=await page.evaluate(async()=>{const m=structuredClone((await import('/webview/store.mjs')).getModel()),r=m.keyBehaviors[0];m.participation=null;r.enabled=true;r.allowedLayers=65535;r.steps=[{tapCount:0,tap:{action:'KC_TRNS',code:1}},{tapCount:1,tap:{action:'KC_A',code:4}}];m.rgb.lighting.keymap[0][0]={code:r.code};m.rgb.lighting.keymap[0][1]={code:r.code};m.rgb.lighting.keymap[1][2]={code:r.code};window.dispatchEvent(new MessageEvent('message',{data:{type:'model',model:m}}));return r.keycode;});
  await page.locator('[data-tool="gesture"]').click();const p=`gesture:${key}`;await field(page,`${p}:path`).selectOption('1');await expect(page.locator('.lighting-gesture')).toContainText('conditional');
  await field(page,`${p}:branch`).selectOption('2');await expect(field(page,`${p}:step`)).toBeVisible();
  await field(page,`${p}:layer`).selectOption('0');await field(page,`${p}:owner`).selectOption('1');await expect(field(page,`${p}:owner`)).toHaveValue('1');await field(page,`${p}:layer`).selectOption('1');await expect(field(page,`${p}:owner`)).toHaveValue('2');expect(await posted(page)).toEqual([]);
 });

 test(`mode and combo looks open their own editors without draft posts (${theme})`,async({page})=>{
  await page.goto('/preview/index.html?host=demo&screen=lighting');await installedHost(page,theme);await page.locator('body').evaluate((b,t)=>b.classList.add('vscode-body',t),theme);await page.locator('[data-tool="overview"]').click();await clearPosts(page);
  await page.locator('[data-look="2:0"] [data-open-owner]').click();await expect(page.locator('h1')).toHaveText('Pointing modes');await expect(page.locator('[data-slot="0"]')).toHaveAttribute('aria-current','true');
  await page.locator('[data-screen="lighting"]').click();await page.locator('[data-tool="overview"]').click();await page.locator('[data-look="3:0"] [data-open-owner]').click();
  const id=await page.evaluate(async()=>{const {getModel,state}=await import('/webview/store.mjs');if(state.combo.editId!==getModel().combos[0].id)throw Error('wrong combo editor');return state.combo.editId;});
  await expect(field(page,`combo:${id}:output`)).toBeVisible();expect(await posted(page)).toEqual([]);
 });

 test(`authored DEMO timing drives the behaviour and Lighting timelines (${theme})`,async({page})=>{
  await page.goto('/dist/web/index.html');await page.evaluate(()=>{window.addEventListener('message',e=>{if(e.data?.type==='model')window.__understandingModel=e.data.model;});const api=window.acquireVsCodeApi(),post=api.postMessage.bind(api);window.__posted=[];api.postMessage=m=>{window.__posted.push(structuredClone(m));return post(m);};});
  await page.locator('[data-act="explore-demo"]').click();await expect(page.locator('.bench-tablist')).toBeVisible();await installedHost(page,theme);
  const wanted=theme==='vscode-dark'?'dark':'light';if(await page.locator('[data-act="theme"]').getAttribute('data-theme-now')!==wanted)await page.locator('[data-act="theme"]').click();
  const info=await page.evaluate(()=>{const m=window.__understandingModel,r=m.keyBehaviors.find(r=>r.steps.some(s=>s.hold&&s.longHold)&&Object.values(m.rgb.lighting.keymap[0]).some(k=>k.code===r.code));return {key:r.keycode,count:r.steps.find(s=>s.hold&&s.longHold).tapCount+1};});
  await page.locator('[data-tab="behaviours"]').click();await page.locator(`[data-row="${info.key}"]`).first().click();await clearPosts(page);
  const timing=field(page,`behaviour:${info.key}:timing:tapHoldTerm`);await timing.fill('317');await timing.press('Tab');await expect(timing).toHaveValue('317');await expect(page.locator('.lighting-gesture')).toContainText('Hold 317 ms');
  expect(await posted(page)).toEqual([expect.objectContaining({type:'saveBehavior',behavior:expect.objectContaining({keycode:info.key,tapHoldTerm:'317'})})]);await clearPosts(page);
  const prefix=`gesture:${info.key}`;await field(page,`${prefix}:branch`).selectOption(String(info.count));const moments=await field(page,`${prefix}:step`).locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));await field(page,`${prefix}:step`).selectOption(moments.find(n=>n.text.includes('Hold · 317')).value);
  await page.locator('.thing-tabs [data-lighting]').click();await expect(page.locator('.lighting-gesture')).toContainText('Hold 317 ms');await page.locator('[data-inspect-gesture]').click();await expect(page.locator('.lighting-situation')).toContainText(`${317+2*(info.count-1)} ms`);expect(await posted(page)).toEqual([]);
 });

 for(const mode of [false,true])test(`R2 guarded ${mode?'mode':'layer'} gesture preserves output and steady feedback in both surfaces (${theme})`,async({page})=>{
  const info=await acceptedGestureDemo(page,theme,mode);expect(info.seedPosts).toHaveLength(8);expect(info.seedPosts[0]).toBe('saveBehavior');
  await page.locator('[data-tab="behaviours"]').click();await page.locator(`[data-row="${info.key}"]`).first().click();await clearPosts(page);
  const prefix=`gesture:${info.key}`,moment=async text=>{const opts=await field(page,`${prefix}:step`).locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));await field(page,`${prefix}:step`).selectOption(opts.find(o=>o.text.includes(text)).value);};
  const pixels=async expected=>expect(await page.locator('[data-gesture-led]').evaluateAll(ns=>[...new Set(ns.map(n=>n.getAttribute('data-colour')))] )).toEqual([expected]);
  await moment('Before hold');await pixels('000000');await moment('Hold · 317');await pixels('c8c8c8');await moment('Next feedback half-period');await pixels('c8c8c8');
  await page.locator('.thing-tabs [data-lighting]').click();await pixels('c8c8c8');await page.locator('[data-inspect-gesture]').click();
  await expect(page.locator('.lighting-situation')).toContainText('517 ms');await expect(page.locator('[data-inspector-rule="0"]')).toContainText('Contributes opaque light');
  await page.locator('[data-tool="gesture"]').click();await field(page,'gesture:behaviour').selectOption(String(info.id));await moment('Before hold');await pixels('000000');await moment('Next feedback half-period');await pixels('c8c8c8');
  await moment('Long hold · 913');await pixels('505050');await expect(page.locator('[data-gesture-moment]')).toContainText('previous held action stays active');await page.locator('[data-inspect-gesture]').click();
  await expect(page.locator('[data-inspector-rule="1"]')).toContainText('Contributes opaque light');await field(page,'inspector:clear-rule').selectOption('1');await expect(page.locator('[data-counterfactual]')).toContainText('#000000');await field(page,'inspector:clear-rule').selectOption('-1');
  await moment('Release');await pixels('c8c8c8');await moment('Before feedback ends');await pixels('c8c8c8');await moment('Feedback interval');await pixels('000000');await page.locator('[data-inspect-gesture]').click();await expect(page.locator('.lighting-situation')).toContainText('1114 ms');expect(await posted(page)).toEqual([]);
 });

 for(const action of ['TO(2)','TG(2)','LOCK_LAYER(2)'])test(`G4 guarded ${action} persists after release without held ownership or retained feedback (${theme})`,async({page})=>{
  const info=await acceptedGestureDemo(page,theme,false,action);expect(info.seedPosts).toHaveLength(8);expect(info.seedPosts[0]).toBe('saveBehavior');
  await page.locator('[data-tab="behaviours"]').click();await page.locator(`[data-row="${info.key}"]`).first().click();await clearPosts(page);
  const prefix=`gesture:${info.key}`,moment=async text=>{const opts=await field(page,`${prefix}:step`).locator('option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.textContent})));await field(page,`${prefix}:step`).selectOption(opts.find(o=>o.text.includes(text)).value);};
  const pixels=async expected=>expect(await page.locator('[data-gesture-led]').evaluateAll(ns=>[...new Set(ns.map(n=>n.getAttribute('data-colour')))] )).toEqual([expected]);
  await moment('Before hold');await pixels('000000');await moment('Hold · 317');await pixels('c8c8c8');await moment('Release');await pixels('505050');
  await page.locator('.thing-tabs [data-lighting]').click();await pixels('505050');await page.locator('[data-inspect-gesture]').click();await expect(page.locator('.lighting-situation')).toContainText('318 ms');await expect(page.locator('[data-inspector-rule="1"]')).toContainText('Contributes opaque light');await expect(page.locator('[data-inspector-rule="0"]')).toContainText('Condition');
  await field(page,'inspector:clear-rule').selectOption('1');await expect(page.locator('[data-counterfactual]')).toContainText('#000000');await field(page,'inspector:clear-rule').selectOption('-1');
  await page.locator('[data-tool="gesture"]').click();await field(page,'gesture:behaviour').selectOption(String(info.id));await moment('Release');await pixels('505050');await moment('Feedback interval');await pixels('505050');await page.locator('[data-inspect-gesture]').click();await expect(page.locator('.lighting-situation')).toContainText('518 ms');expect(await posted(page)).toEqual([]);
 });

}
