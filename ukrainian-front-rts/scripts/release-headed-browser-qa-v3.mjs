#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = String(process.env.RELEASE_QA_BROWSER || '').toLowerCase();
const commit = String(process.env.RELEASE_QA_COMMIT || process.env.GITHUB_SHA || '');
const out = resolve(root, 'artifacts', 'release-browser-qa', browser || 'unknown');
const host = '127.0.0.1';
const appPort = Number(process.env.RELEASE_QA_APP_PORT || 4180);
const driverPort = Number(process.env.RELEASE_QA_DRIVER_PORT || 9515);
const url = `http://${host}:${appPort}/`;
const E = 'element-6066-11e4-a52e-4f735466cecf';
const ESC = '\uE00C';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const pass = (evidence = {}) => ({ status: 'PASS', evidence });
const na = (reason, evidence = {}) => ({ status: 'N/A', reason, evidence });
const mime = { '.css':'text/css','.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg' };

if (!['chrome','edge','firefox','safari'].includes(browser)) throw new Error(`Unsupported browser ${browser}`);
await mkdir(out, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, url).pathname);
    if (pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const rel = relative(root, file);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Invalid path');
    res.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) { res.statusCode = 404; res.end(error.message); }
});
await new Promise((ok, bad) => { server.once('error', bad); server.listen(appPort, host, ok); });

function capabilities() {
  if (browser === 'chrome') return { browserName:'chrome', 'goog:chromeOptions':{ args:['--disable-search-engine-choice-screen','--disable-dev-shm-usage'] } };
  if (browser === 'edge') return { browserName:'MicrosoftEdge', 'ms:edgeOptions':{ args:['--disable-search-engine-choice-screen','--disable-dev-shm-usage'] } };
  if (browser === 'firefox') return { browserName:'firefox', 'moz:firefoxOptions':{ args:[], prefs:{ 'layout.css.devPixelsPerPx':'1.25' } } };
  return { browserName:'safari' };
}

const driverPath = process.env.RELEASE_QA_DRIVER || (browser === 'safari' ? '/usr/bin/safaridriver' : `${browser}driver`);
const driver = spawn(driverPath, browser === 'safari' ? ['-p', String(driverPort)] : [`--port=${driverPort}`], { stdio:['ignore','pipe','pipe'] });
const driverLog = [];
driver.stdout.on('data', c => driverLog.push(c.toString()));
driver.stderr.on('data', c => driverLog.push(c.toString()));
let exited = false;
driver.on('exit', (code, signal) => { exited = true; driverLog.push(`[exit] ${code ?? signal}\n`); });

async function http(method, path, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${driverPort}${path}`, { method, headers: body === undefined ? undefined : {'content-type':'application/json'}, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `${method} ${path}: HTTP ${response.status}`);
    return payload.value;
  } finally { clearTimeout(timer); }
}
async function waitDriver() {
  for (let i=0;i<160;i+=1) { if (exited) break; try { const s=await http('GET','/status',undefined,1500); if (s?.ready !== false) return; } catch {} await delay(250); }
  throw new Error(`WebDriver unavailable: ${driverLog.join('')}`);
}

let session = null;
const wd = (method, suffix, body, timeout) => http(method, `/session/${session}${suffix}`, body, timeout);
const js = (script, args=[]) => wd('POST','/execute/sync',{script,args});
async function waitFor(expression, label, attempts=120) { for(let i=0;i<attempts;i+=1){ try{if(await js(`return Boolean(${expression});`)) return;}catch{} await delay(120);} throw new Error(`Timed out: ${label}`); }
async function el(selector) { const v=await wd('POST','/element',{using:'css selector',value:selector}); return v?.[E]; }
async function click(selector) { const id=await el(selector); await wd('POST',`/element/${id}/click`,{}); }
async function keys(value) { await wd('POST','/actions',{actions:[{type:'key',id:'kbd',actions:[{type:'keyDown',value},{type:'keyUp',value}]}]}); await wd('DELETE','/actions'); }
async function setWindow(width,height){ await wd('POST','/window/rect',{x:0,y:0,width,height}); await delay(200); return js('return {innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio};'); }
async function shot(name){ const data=await wd('GET','/screenshot'); await writeFile(join(out,name),Buffer.from(data,'base64')); return name; }
async function canvasClick(x,y){ const c=await el('#game'); const r=await js('const r=document.querySelector("#game").getBoundingClientRect();return {w:r.width,h:r.height};'); await wd('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:{[E]:c},x:Math.round(x-r.w/2),y:Math.round(y-r.h/2)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]}); await wd('DELETE','/actions'); await delay(25); }

async function layout(){ return js(`
 const R=e=>{const r=e?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null};
 const t=document.querySelector('#topbar'),tr=R(t),card=R(document.querySelector('.commandCardGrid'));
 const children=[...(t?.children||[])].map(e=>({id:e.id||e.className||e.tagName,display:getComputedStyle(e).display,...R(e)}));
 const visible=children.filter(c=>c.display!=='none'&&c.width>0&&c.height>0);
 const buttons=[...document.querySelectorAll('.commandCardAction')].map(e=>({id:e.dataset.commandId,group:e.dataset.commandGroup,fallback:e.dataset.iconStatus==='fallback',icon:Boolean(e.querySelector('.commandCardIcon')),...R(e)}));
 return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},topbar:tr,children,commandPanel:R(document.querySelector('#commandPanel')),card,buttons,
 topbarOverflow:Boolean(tr&&visible.some(c=>c.left<tr.left-.5||c.right>tr.right+.5||c.top<tr.top-.5||c.bottom>tr.bottom+.5)),
 commandOverflow:Boolean(card&&buttons.some(b=>b.left<card.left-.5||b.right>card.right+.5||b.top<card.top-.5||b.bottom>card.bottom+.5)),
 viewportOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.documentElement.scrollHeight>document.documentElement.clientHeight,
 fallbackCount:buttons.filter(b=>b.fallback).length,missingIconCount:buttons.filter(b=>!b.icon).length,selectionName:document.querySelector('#selectionName')?.textContent||'',groups:[...new Set(buttons.map(b=>b.group))]};
`); }

async function findSelections(){
 const field=await js(`const c=document.querySelector('#game').getBoundingClientRect(),p=document.querySelector('#commandPanel').getBoundingClientRect();return {w:c.width,maxY:Math.min(c.height-8,p.top-8)};`);
 const points=[]; for(let y=Math.max(190,field.maxY*.32);y<field.maxY-20;y+=24) for(let x=Math.max(120,field.w*.08);x<Math.min(field.w*.65,820);x+=24) points.push([x,y]);
 let unit=null,building=null;
 for(const [x,y] of points){ await canvasClick(x,y); const s=await layout(); if(!unit&&s.buttons.some(b=>b.id==='attack-move'))unit={x:Math.round(x),y:Math.round(y),name:s.selectionName}; if(!building&&s.groups.some(g=>['production','modernization','construction'].includes(g)))building={x:Math.round(x),y:Math.round(y),name:s.selectionName}; if(unit&&building)break; }
 return {unit,building};
}

async function cdp(cmd,params){
 const paths = browser === 'edge' ? ['/ms/cdp/execute','/goog/cdp/execute'] : ['/goog/cdp/execute'];
 let last; for(const path of paths){ try{return await wd('POST',path,{cmd,params});}catch(error){last=error;} } throw last;
}
async function setChromiumMetrics(width,height,dpr){ await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile:false}); await delay(220); return layout(); }
async function clearChromiumMetrics(){ if(['chrome','edge'].includes(browser)) try{await cdp('Emulation.clearDeviceMetricsOverride',{});}catch{} }

const report={schema:'fields-of-resolve.release-headed-browser-qa',version:3,browser,headed:true,candidateCommit:commit,runner:{os:process.env.ImageOS||process.platform,imageVersion:process.env.ImageVersion||null},tester:'OpenAI assistant via native headed browser automation and captured runtime evidence',capabilities:null,surfaces:{},uiReview:null,screenshots:[],status:'FAIL'};
try{
 await waitDriver(); const created=await http('POST','/session',{capabilities:{alwaysMatch:capabilities()}},60000); session=created?.sessionId||created?.value?.sessionId; report.capabilities=created?.capabilities||created?.value?.capabilities||{}; assert(session,'No WebDriver session');
 await setWindow(1440,900); await wd('POST','/url',{url}); await waitFor(`document.readyState==='complete'&&document.querySelector('.missionCard button')&&window.__fieldsOfResolveComposition`,'startup');
 await js(`localStorage.setItem('fields-of-resolve.release-qa-sentinel','${commit}')`); await wd('POST','/refresh',{}); await waitFor(`document.readyState==='complete'&&document.querySelector('.missionCard button')`,'reload'); assert(await js(`return localStorage.getItem('fields-of-resolve.release-qa-sentinel')==='${commit}'`),'storage'); report.surfaces.storage=pass({commit});
 await js(`window.__releaseQaErrors=[];addEventListener('error',e=>window.__releaseQaErrors.push(String(e.message||e.error||'error')));addEventListener('unhandledrejection',e=>window.__releaseQaErrors.push(String(e.reason||'unhandled rejection')));[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all')?.click();`);
 await click('.missionCard button'); await waitFor(`document.querySelector('#missionSelect')?.classList.contains('hidden')`,'mission'); await js(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all')?.click()`);
 const canvas=await js(`const c=document.querySelector('#game'),r=c.getBoundingClientRect();return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,context:Boolean(c.getContext('2d'))};`); assert(canvas.context&&canvas.width>0&&canvas.cssWidth>0,'canvas'); report.surfaces.canvas=pass(canvas);
 await click('#audioSettingsToggle'); await waitFor(`!document.querySelector('#audioSettings')?.classList.contains('hidden')`,'audio open'); await js(`const s=document.querySelector('[data-audio-level="music"]');s.value='43';s.dispatchEvent(new Event('input',{bubbles:true}))`); await waitFor(`JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music===0.43`,'audio persist'); const audio=await js(`return {music:JSON.parse(localStorage.getItem('fields-of-resolve.audio-settings.v1')||'{}')?.levels?.music,context:window.__fieldsOfResolveComposition.audio()?.output?.contextState||null}`); await click('#audioSettingsDone'); report.surfaces.audio=pass(audio);
 const sel=await findSelections(); assert(sel.unit,'No combat unit'); await canvasClick(sel.unit.x,sel.unit.y); await keys('q'); await delay(150); const keyboard=await js(`const b=document.querySelector('[data-command-id="attack-move"]');return {found:Boolean(b),targeting:b?.dataset?.targeting,ariaCurrent:b?.getAttribute('aria-current')}`); assert(keyboard.found&&(keyboard.targeting==='true'||keyboard.ariaCurrent==='true'),'Q attack-move'); report.surfaces.keyboard=pass({...keyboard,selected:sel.unit.name});
 const util=await layout(); const fs=util.children.find(c=>c.id==='viewportFullscreenToggle'); assert(fs&&fs.display!=='none'&&!util.topbarOverflow,`utility controls clipped: ${JSON.stringify(util.children)}`); const fsEnabled=await js(`return Boolean(document.fullscreenEnabled)`); if(!fsEnabled) report.surfaces.fullscreen=na('Standard Fullscreen API unavailable in this headed session'); else { await click('#viewportFullscreenToggle'); await waitFor(`document.fullscreenElement!==null`,'fullscreen enter',80); const fse=await js(`return {active:Boolean(document.fullscreenElement),width:innerWidth,height:innerHeight}`); await keys(ESC); await waitFor(`document.fullscreenElement===null`,'fullscreen exit',80); if(await js(`return Boolean(document.querySelector('#pauseMenu')&&!document.querySelector('#pauseMenu').classList.contains('hidden'))`)) await click('#pauseMenuClose'); report.surfaces.fullscreen=pass(fse); }
 // DPI/zoom uses browser-native scaling: Firefox launches at 1.25 CSS dev pixels,
 // Safari uses the runner's native Retina DPR, and Chromium uses DevTools emulation.
 const nativeMetrics=await js(`return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio}`); if(browser==='firefox'){ assert(nativeMetrics.dpr>=1.2,`Firefox DPR preference not applied: ${JSON.stringify(nativeMetrics)}`); const s=await layout(); assert(!s.topbarOverflow&&!s.commandOverflow,'Firefox high-DPI overflow'); report.surfaces.dpi=pass({mode:'moz-native-dev-pixels',...nativeMetrics}); } else if(browser==='safari'){ if(nativeMetrics.dpr>1.1){const s=await layout();assert(!s.topbarOverflow&&!s.commandOverflow,'Safari Retina overflow');report.surfaces.dpi=pass({mode:'native-retina',...nativeMetrics});}else report.surfaces.dpi=na('Hosted Safari display reports DPR 1; no browser-chrome zoom automation is exposed by SafariDriver',nativeMetrics); } else { const scaled=await setChromiumMetrics(Math.max(900,nativeMetrics.width),Math.max(600,nativeMetrics.height),1.25); assert(scaled.viewport.dpr>=1.2&&!scaled.topbarOverflow&&!scaled.commandOverflow,`Chromium DPR scaling failed: ${JSON.stringify(scaled.viewport)}`); report.surfaces.dpi=pass({mode:'devtools-device-scale-factor',before:nativeMetrics,after:scaled.viewport}); await clearChromiumMetrics(); }
 const perf=await wd('POST','/execute/async',{script:`const done=arguments[arguments.length-1],s=[];let p=performance.now();const f=n=>{s.push(n-p);p=n;if(s.length>=90){const q=[...s].sort((a,b)=>a-b);done({frames:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,p95:q[Math.floor(q.length*.95)],max:Math.max(...s)})}else requestAnimationFrame(f)};requestAnimationFrame(f);`,args:[]},15000); assert(perf.frames===90&&perf.mean<80&&perf.max<750,`performance ${JSON.stringify(perf)}`); report.surfaces.performance=pass(perf);
 if(browser==='chrome'&&process.platform==='win32'){ const reviews=[]; for(const [w,h] of [[1280,720],[1920,1080],[2560,1080]]){ const base=await setChromiumMetrics(w,h,1); assert(base.viewport.width===w&&base.viewport.height===h,`viewport ${w}x${h}`); const found=await findSelections(); assert(found.unit&&found.building,`selection ${w}x${h}`); await canvasClick(found.unit.x,found.unit.y); const u=await layout(); assert(!u.topbarOverflow&&!u.viewportOverflow&&!u.commandOverflow&&u.fallbackCount===0&&u.missingIconCount===0,`unit UI ${w}x${h}`); assert(u.topbar?.height<=64.5&&u.commandPanel?.height<=176.5,`unit budget ${w}x${h}`); report.screenshots.push(await shot(`windows-chrome-${w}x${h}-unit.png`)); await canvasClick(found.building.x,found.building.y); const b=await layout(); assert(!b.topbarOverflow&&!b.viewportOverflow&&!b.commandOverflow&&b.fallbackCount===0&&b.missingIconCount===0,`building UI ${w}x${h}`); assert(b.groups.some(g=>['production','modernization','construction'].includes(g)),`building groups ${w}x${h}`); assert(b.topbar?.height<=64.5&&b.commandPanel?.height<=176.5,`building budget ${w}x${h}`); report.screenshots.push(await shot(`windows-chrome-${w}x${h}-building.png`)); reviews.push({viewport:{width:w,height:h},unit:{selection:found.unit,layout:u},building:{selection:found.building,layout:b}}); } await clearChromiumMetrics(); report.uiReview={issue:183,status:'PASS',mode:'headed Windows Chrome with exact DevTools CSS viewport; runtime screenshots captured for review',viewports:reviews}; }
 const runtimeErrors=await js(`return window.__releaseQaErrors||[]`); assert(runtimeErrors.length===0,`runtime errors ${runtimeErrors.join('; ')}`); const required=['keyboard','audio','canvas','storage','fullscreen','dpi','performance']; assert(required.every(k=>['PASS','N/A'].includes(report.surfaces[k]?.status)),`incomplete ${JSON.stringify(report.surfaces)}`); report.runtimeErrors=runtimeErrors; report.status='PASS'; report.screenshots.push(await shot(`${browser}-final.png`)); await writeFile(join(out,'report.json'),`${JSON.stringify(report,null,2)}\n`); console.log(`[release-headed-browser-qa-v3] ${browser} PASS ${report.capabilities?.browserVersion||'unknown'} ${required.map(k=>`${k}=${report.surfaces[k].status}`).join(' ')}`);
}catch(error){report.error=error.stack||String(error);try{if(session)report.screenshots.push(await shot(`${browser}-failure.png`));}catch{}await writeFile(join(out,'report.json'),`${JSON.stringify(report,null,2)}\n`);await writeFile(join(out,'driver.log'),`${driverLog.join('')}\n${error.stack||error}\n`);throw error;}finally{await clearChromiumMetrics();if(session)try{await http('DELETE',`/session/${session}`,undefined,5000)}catch{}if(!exited)driver.kill('SIGTERM');await delay(400);if(!exited)driver.kill('SIGKILL');await new Promise(r=>server.close(r));}
