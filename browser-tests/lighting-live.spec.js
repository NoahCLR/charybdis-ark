"use strict";
const {test,expect}=require('@playwright/test');
const {installFakeHid}=require('./fake-hid');
const {lightingLiveKeyboard}=require('../tests/fixtures/lighting-live-keyboard');
const {document}=require('../tests/fixtures/portable-profile');
const {CHARYBDIS_VENDOR_ID,CHARYBDIS_PRODUCT_ID,QMK_RAW_HID_USAGE_PAGE,QMK_RAW_HID_USAGE}=require('../core/transport/device-adapter');
const fs=require('node:fs');
async function open(page,theme){
 const keyboard=lightingLiveKeyboard(document());
 await page.exposeFunction('__liveKeyboard',(id,bytes)=>{expect(id).toBe(0);return keyboard.answer(Buffer.from(bytes)).map(r=>[...r]);});
 await page.addInitScript(installFakeHid,{vendorId:CHARYBDIS_VENDOR_ID,productId:CHARYBDIS_PRODUCT_ID,usagePage:QMK_RAW_HID_USAGE_PAGE,usage:QMK_RAW_HID_USAGE,bridge:'__liveKeyboard'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/dist/web/index.html');
 await page.evaluate(()=>{const api=window.acquireVsCodeApi(),send=api.postMessage.bind(api);window.__posted=[];api.postMessage=m=>{window.__posted.push(structuredClone(m));return send(m);};window.addEventListener('message',e=>{if(e.data?.type==='model')window.__liveModel=e.data.model;});});
 await page.locator('.rail [data-act="choose-keyboard"]').click();await expect(page.locator('[data-screen="lighting"]')).toBeEnabled({timeout:20000});
 // Match the installed host stylesheet when available, plus both real body
 // classes. No host theme or fixture bypass is built into the product.
 const file=`preview/${theme}.html`;if(fs.existsSync(file)){const css=[...fs.readFileSync(file,'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');await page.route("**/lighting-live-host.css",route=>route.fulfill({contentType:"text/css",body:css}));await page.addStyleTag({url:"/preview/lighting-live-host.css"});}
 await page.locator('body').evaluate((b,t)=>b.classList.add('vscode-body',t),theme);
 await page.evaluate(t=>{document.documentElement.dataset.theme=t==='vscode-dark'?'dark':'light';},theme);
 await page.locator('[data-screen="lighting"]').click();await expect(page.locator('.lighting-live')).toBeVisible();
 await page.evaluate(()=>{window.__posted=[];});return{keyboard,errors};
}
for(const theme of ['vscode-dark','vscode-light']) {
 test(`Live reads and separate unsaved Try controls run through the real host (${theme})`,async({page})=>{
  const{k,errors}=await open(page,theme).then(({keyboard:k,errors})=>({k,errors}));
  await expect(page.locator('[data-live-start]')).toHaveText('Start Live');expect(k.liveRequests).toHaveLength(0);
  const startNode=await page.locator('[data-live-start]').elementHandle(),localNode=await page.locator('[data-f="situation:advance"]').elementHandle();
  await page.locator('[data-live-start]').click();await expect(page.locator('.live-sample')).toContainText('USB half main sample');await expect(page.locator('[data-live-start]')).toHaveText('Pause Live');
  expect(await page.locator('[data-live-start]').evaluate((el,old)=>el===old,startNode)).toBe(true);expect(await page.locator('[data-f="situation:advance"]').evaluate((el,old)=>el===old,localNode)).toBe(true);
  expect(k.liveRequests.every(r=>r[0]===8||r[4]===1)).toBe(true);await expect(page.locator('[data-preview-state]')).toContainText('never saved');
  const revision=await page.evaluate(()=>window.__liveModel.draft.revision);
  await expect(page.locator('[data-try-frame]')).toBeEnabled();await page.locator('[data-try-frame]').click();await expect(page.locator('[data-preview-state]')).toContainText('confirmed by both halves');expect(k.displayed).toHaveLength(174);
  await expect(page.locator('.live-sample')).toContainText('temporary frame overrides');await page.locator('[data-stop-frame]').click();await expect(page.locator('[data-preview-state]')).toContainText('Nothing was saved');expect(k.displayed).toBeNull();
  await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-state]')).toContainText('paused');
  expect(await page.evaluate(()=>window.__liveModel.draft.revision)).toBe(revision);expect(await page.evaluate(()=>window.__liveModel.draft.dirty)).toBe(false);
  const posts=await page.evaluate(()=>window.__posted.map(m=>m.type));expect(posts).toEqual(['startLightingLive','tryLightingFrame','stopLightingFrame','pauseLightingLive']);expect(k.mutations).toHaveLength(0);expect(errors).toEqual([]);
 });
 test(`screen exit during pending PUBLISH cancels and never automatically restarts (${theme})`,async({page})=>{
  const{keyboard:k,errors}=await open(page,theme);let admitted=false;
  k.before=r=>{if(r[0]===7&&r[4]===4&&!admitted){admitted=true;k.pendingForever=true;}};
  await page.locator('[data-try-frame]').click();await expect.poll(()=>admitted,{intervals:[5,10,10]}).toBe(true);
  await page.locator('[data-screen="settings"]').click();k.pendingForever=false;await expect.poll(()=>k.displayed).toBeNull();
  await expect.poll(()=>k.liveRequests.some(r=>r[0]===7&&r[4]===6)).toBe(true);
  await page.locator('[data-screen="lighting"]').click();await expect(page.locator('[data-live-start]')).toHaveText('Start Live');await expect(page.locator('[data-preview-state]')).toContainText('stopped');expect(k.mutations).toHaveLength(0);expect(errors).toEqual([]);
 });
 test(`mixed sample and peer refusal are visible with bounded traffic (${theme})`,async({page})=>{
  const{keyboard:k,errors}=await open(page,theme);k.badPage=4;await page.locator('[data-live-start]').click();await expect(page.locator('[data-live-state]')).toContainText('different captures');await expect(page.locator('.live-sample')).toBeEmpty();
  k.badPage=-1;k.peerResult=10;await page.locator('[data-try-frame]').click();await expect(page.locator('[data-preview-state]')).toContainText('other half');expect(k.displayed).toBeNull();expect(k.liveRequests.length).toBeLessThan(40);expect(k.mutations).toHaveLength(0);expect(errors).toEqual([]);
 });
}
test('demo has no advertised Live backend and never posts temporary controls',async({page})=>{
 await page.goto('/dist/web/index.html');await page.locator('[data-act="explore-demo"]').click();await expect(page.locator('[data-screen="lighting"]')).toBeEnabled();await page.locator('[data-screen="lighting"]').click();await expect(page.locator('[data-live-start]')).toBeDisabled();await expect(page.locator('[data-try-frame]')).toBeDisabled();await expect(page.locator('.lighting-live')).toContainText('demo has no keyboard');
});
