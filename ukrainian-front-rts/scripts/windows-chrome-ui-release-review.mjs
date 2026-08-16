#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = String(process.env.RELEASE_QA_COMMIT || process.env.GITHUB_SHA || '');
const driverPath = process.env.RELEASE_QA_DRIVER;
if (!driverPath) throw new Error('RELEASE_QA_DRIVER must point to ChromeDriver.');
const out = resolve(root, 'artifacts', 'release-browser-qa', 'chrome');
const host = '127.0.0.1';
const appPort = 4182;
const driverPort = 9517;
const url = `http://${host}:${appPort}/`;
const E = 'element-6066-11e4-a52e-4f735466cecf';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const mime = { '.css':'text/css','.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
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

const driverLog = [];
const driver = spawn(driverPath, [`--port=${driverPort}`], { stdio:['ignore','pipe','pipe'] });
driver.stdout.on('data', (chunk) => driverLog.push(chunk.toString()));
driver.stderr.on('data', (chunk) => driverLog.push(chunk.toString()));
let exited = false;
driver.on('exit', () => { exited = true; });

async function http(method, path, body, timeoutMs=20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${driverPort}${path}`, { method, headers:body===undefined?undefined:{'content-type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body), signal:controller.signal });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `${method} ${path}: ${response.status}`);
    return payload.value;
  } finally { clearTimeout(timer); }
}
async function waitDriver(){ for(let i=0;i<120;i+=1){ if(exited) break; try{const status=await http('GET','/status',undefined,1200);if(status?.ready!==false)return;}catch{} await delay(200);} throw new Error(`ChromeDriver unavailable: ${driverLog.join('')}`); }
let session=null;
const wd=(method,suffix,body,timeout)=>http(method,`/session/${session}${suffix}`,body,timeout);
const js=(script,args=[])=>wd('POST','/execute/sync',{script,args});
async function waitFor(expression,label){for(let i=0;i<120;i+=1){try{if(await js(`return Boolean(${expression})`))return;}catch{}await delay(100);}throw new Error(`Timed out: ${label}`);}
async function el(selector){const value=await wd('POST','/element',{using:'css selector',value:selector});return value?.[E];}
async function click(selector){const id=await el(selector);await wd('POST',`/element/${id}/click`,{});}
async function canvasClick(x,y){const canvas=await el('#game');const rect=await js('const r=document.querySelector("#game").getBoundingClientRect();return {w:r.width,h:r.height}');await wd('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:{[E]:canvas},x:Math.round(x-rect.w/2),y:Math.round(y-rect.h/2)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});await wd('DELETE','/actions');await delay(25);}
async function shot(name){const base64=await wd('GET','/screenshot');await writeFile(join(out,name),Buffer.from(base64,'base64'));return name;}
async function cdp(cmd,params){return wd('POST','/goog/cdp/execute',{cmd,params});}
async function metrics(width,height){await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(180);return snapshot();}
async function clearMetrics(){try{await cdp('Emulation.clearDeviceMetricsOverride',{});}catch{}}

async function snapshot(){return js(`
 const R=e=>{const r=e?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null};
 const top=document.querySelector('#topbar'),tr=R(top),card=R(document.querySelector('.commandCardGrid'));
 const children=[...(top?.children||[])].map(e=>({id:e.id||e.className||e.tagName,display:getComputedStyle(e).display,...R(e)}));
 const visible=children.filter(c=>c.display!=='none'&&c.width>0&&c.height>0);
 const buttons=[...document.querySelectorAll('.commandCardAction')].map(e=>({id:e.dataset.commandId,group:e.dataset.commandGroup,fallback:e.dataset.iconStatus==='fallback',icon:Boolean(e.querySelector('.commandCardIcon')),...R(e)}));
 return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},topbar:tr,commandPanel:R(document.querySelector('#commandPanel')),card,buttons,
 topbarOverflow:Boolean(tr&&visible.some(c=>c.left<tr.left-.5||c.right>tr.right+.5||c.top<tr.top-.5||c.bottom>tr.bottom+.5)),
 commandOverflow:Boolean(card&&buttons.some(b=>b.left<card.left-.5||b.right>card.right+.5||b.top<card.top-.5||b.bottom>card.bottom+.5)),
 viewportOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.documentElement.scrollHeight>document.documentElement.clientHeight,
 fallbackCount:buttons.filter(b=>b.fallback).length,missingIconCount:buttons.filter(b=>!b.icon).length,selectionName:document.querySelector('#selectionName')?.textContent||'',groups:[...new Set(buttons.map(b=>b.group))]};
`);}

async function discover(){
 const field=await js(`const c=document.querySelector('#game').getBoundingClientRect(),p=document.querySelector('#commandPanel').getBoundingClientRect();return {w:c.width,maxY:Math.min(c.height-8,p.top-8)}`);
 let unit=null,building=null;
 for(let y=Math.max(180,field.maxY*.30);y<field.maxY-18;y+=22){for(let x=Math.max(100,field.w*.07);x<Math.min(field.w*.70,850);x+=22){await canvasClick(x,y);const s=await snapshot();if(!unit&&s.buttons.some(b=>b.id==='attack-move'))unit={x:Math.round(x),y:Math.round(y),name:s.selectionName};if(!building&&s.groups.some(g=>['production','modernization','construction'].includes(g)))building={x:Math.round(x),y:Math.round(y),name:s.selectionName};if(unit&&building)return{unit,building};}}
 return{unit,building};
}
function assertLayout(state,label){assert(!state.topbarOverflow,`${label}: topbar overflow`);assert(!state.viewportOverflow,`${label}: viewport overflow`);assert(!state.commandOverflow,`${label}: command-card overflow`);assert(state.fallbackCount===0,`${label}: diagnostic fallback icon`);assert(state.missingIconCount===0,`${label}: missing command icon`);assert(state.topbar?.height<=64.5,`${label}: topbar height ${state.topbar?.height}`);assert(state.commandPanel?.height<=176.5,`${label}: command panel height ${state.commandPanel?.height}`);}

const report={schema:'fields-of-resolve.windows-chrome-ui-release-review',version:1,candidateCommit:commit,browser:'chrome',headed:true,runner:{os:process.env.ImageOS||process.platform,imageVersion:process.env.ImageVersion||null},capabilities:null,status:'FAIL',selections:null,viewports:[],screenshots:[],tester:'OpenAI assistant; headed Windows Chrome runtime interaction plus manual screenshot review pending'};
try{
 await waitDriver();const created=await http('POST','/session',{capabilities:{alwaysMatch:{browserName:'chrome','goog:chromeOptions':{args:['--disable-search-engine-choice-screen','--disable-dev-shm-usage']}}}},60000);session=created?.sessionId||created?.value?.sessionId;report.capabilities=created?.capabilities||created?.value?.capabilities||{};assert(session,'No Chrome session');
 await wd('POST','/window/rect',{x:0,y:0,width:1050,height:900});await wd('POST','/url',{url});await waitFor(`document.readyState==='complete'&&document.querySelector('.missionCard button')`,'startup');await js(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all')?.click()`);await click('.missionCard button');await waitFor(`document.querySelector('#missionSelect')?.classList.contains('hidden')`,'mission');await js(`[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Dismiss all')?.click()`);
 const selections=await discover();assert(selections.unit&&selections.building,`Could not discover both selections: ${JSON.stringify(selections)}`);report.selections=selections;
 for(const [width,height] of [[1280,720],[1920,1080],[2560,1080]]){
   await clearMetrics();await canvasClick(selections.unit.x,selections.unit.y);const unitNative=await snapshot();assert(unitNative.buttons.some(b=>b.id==='attack-move'),`Unit selection lost before ${width}x${height}`);const unit=await metrics(width,height);assert(unit.viewport.width===width&&unit.viewport.height===height,`Unit viewport mismatch ${width}x${height}`);assertLayout(unit,`unit ${width}x${height}`);const unitFile=await shot(`windows-chrome-${width}x${height}-unit.png`);report.screenshots.push(unitFile);
   await clearMetrics();await canvasClick(selections.building.x,selections.building.y);const buildingNative=await snapshot();assert(buildingNative.groups.some(g=>['production','modernization','construction'].includes(g)),`Building selection lost before ${width}x${height}`);const building=await metrics(width,height);assert(building.viewport.width===width&&building.viewport.height===height,`Building viewport mismatch ${width}x${height}`);assertLayout(building,`building ${width}x${height}`);assert(building.groups.some(g=>['production','modernization','construction'].includes(g)),`Building groups missing ${width}x${height}`);const buildingFile=await shot(`windows-chrome-${width}x${height}-building.png`);report.screenshots.push(buildingFile);
   report.viewports.push({width,height,unit:{selection:selections.unit,layout:unit},building:{selection:selections.building,layout:building}});
 }
 report.status='PASS';await writeFile(join(out,'ui-review.json'),`${JSON.stringify(report,null,2)}\n`);console.log(`[windows-chrome-ui-release-review] PASS ${report.capabilities?.browserVersion||'unknown'} at 1280x720, 1920x1080, 2560x1080`);
}catch(error){report.error=error.stack||String(error);try{if(session)report.screenshots.push(await shot('windows-chrome-ui-failure.png'));}catch{}await writeFile(join(out,'ui-review.json'),`${JSON.stringify(report,null,2)}\n`);throw error;}finally{await clearMetrics();if(session)try{await http('DELETE',`/session/${session}`,undefined,5000)}catch{}if(!exited)driver.kill('SIGTERM');await delay(300);if(!exited)driver.kill('SIGKILL');await new Promise(done=>server.close(done));}
