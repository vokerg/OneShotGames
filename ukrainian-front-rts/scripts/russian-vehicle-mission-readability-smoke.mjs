#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=resolve(root,'artifacts/paired-vehicle-mission-readability');
const host='127.0.0.1',port=4181,browserPort=9231,pageUrl=`http://${host}:${port}/`;
const mime={'.css':'text/css','.html':'text/html','.ico':'image/x-icon','.js':'text/javascript','.json':'application/json','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const delay=(ms)=>new Promise((r)=>setTimeout(r,ms));
function findBrowser(){const entries=(process.env.PATH||'').split(delimiter);return process.env.CHROME_BIN||['google-chrome','chromium','chromium-browser'].find((name)=>entries.some((dir)=>existsSync(join(dir,name))));}
await mkdir(artifacts,{recursive:true});
const browser=findBrowser();
if(!browser)throw new Error('No Chrome/Chromium executable found. Set CHROME_BIN.');
if(typeof WebSocket!=='function')throw new Error('The paired vehicle mission review requires the Node.js WebSocket global.');

const server=createServer(async(request,response)=>{try{const pathname=decodeURIComponent(new URL(request.url,pageUrl).pathname);if(pathname==='/favicon.ico'){response.statusCode=204;response.end();return;}const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');const file=resolve(root,requested);const projectRelative=relative(root,file);if(isAbsolute(projectRelative)||projectRelative==='..'||projectRelative.startsWith(`..${sep}`))throw new Error('Invalid path');response.setHeader('content-type',mime[extname(file)]||'application/octet-stream');if(requested==='src/main.js'){const source=await readFile(file,'utf8');response.end(`${source}\nwindow.__vehicleReview = Object.freeze({ game, renderer });\n`);return;}response.end(await readFile(file));}catch(error){response.statusCode=404;response.end(error.message);}});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(port,host,ok);});
const profile=await mkdtemp(join(tmpdir(),'ufrts-paired-vehicle-review-'));
const logs=[];const chrome=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--hide-scrollbars','--window-size=1600,1000',`--remote-debugging-port=${browserPort}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});chrome.stderr.on('data',(chunk)=>logs.push(chunk.toString()));let chromeExited=false;const chromeExit=new Promise((r)=>chrome.once('exit',(code,signal)=>{chromeExited=true;logs.push(`[exit] code=${code??'null'} signal=${signal??'null'}\n`);r();}));
let socket,nextId=1;const pending=new Map(),events=[];
async function connect(){for(let attempt=0;attempt<120;attempt+=1){try{const response=await fetch(`http://${host}:${browserPort}/json`);const target=response.ok?(await response.json()).find((item)=>item.type==='page'):null;if(target?.webSocketDebuggerUrl){socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});});socket.addEventListener('message',({data})=>{const message=JSON.parse(data);if(message.id&&pending.has(message.id)){const entry=pending.get(message.id);pending.delete(message.id);clearTimeout(entry.timeout);message.error?entry.reject(new Error(message.error.message)):entry.resolve(message.result);}else if(message.method)events.push(message);});return;}}catch(error){logs.push(`[connect ${attempt+1}] ${error.message}\n`);}await delay(250);}throw new Error('Chrome DevTools endpoint did not become available.');}
function call(method,params={},timeoutMs=8000){const id=nextId++;return new Promise((resolveCall,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Chrome DevTools call timed out: ${method}`));},timeoutMs);pending.set(id,{resolve:resolveCall,reject,timeout});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const evaluation=await call('Runtime.evaluate',{expression,returnByValue:true});if(evaluation.exceptionDetails)throw new Error(`Browser evaluation failed: ${evaluation.exceptionDetails.exception?.description||evaluation.exceptionDetails.text}`);return evaluation.result?.value;}
async function waitFor(expression,description){for(let attempt=0;attempt<100;attempt+=1){try{const value=await evaluate(expression);if(value)return value;}catch(error){logs.push(`[wait ${description}] ${error.message}\n`);}await delay(200);}throw new Error(`Timed out waiting for ${description}.`);}
async function capture(name){const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const bytes=Buffer.from(shot.data,'base64');if(bytes.length<10000)throw new Error(`${name} screenshot is unexpectedly small (${bytes.length} bytes).`);await writeFile(resolve(artifacts,name),bytes);return bytes.length;}
async function setReview(type,team,zoom){return evaluate(`(()=>{const {game}=window.__vehicleReview;const center=game.worldPos(innerWidth/2,innerHeight/2);let unit=game.units.find((candidate)=>candidate.type==='${type}'&&candidate.__pairedVehicleReview);if(!unit){unit=game.addUnit('${type}',${team},center.x,center.y);unit.__pairedVehicleReview=true;}unit.x=center.x;unit.y=center.y;unit.angle=-Math.PI/2;unit.order=null;unit.vx=0;unit.vy=0;unit.flash=0;game.camera.z=${zoom};game.camera.x=innerWidth/2-unit.x*game.camera.z;game.camera.y=innerHeight/2-unit.y*game.camera.z;const screen=window.__vehicleReview.renderer.sp(unit.x,unit.y);return{id:unit.id,type:unit.type,team:unit.team,zoom:game.camera.z,screenX:screen.x,screenY:screen.y};})()`);}

try{
  await connect();await call('Runtime.enable');await call('Log.enable');await call('Page.enable');await call('Network.enable');await call('Page.navigate',{url:pageUrl});
  await waitFor(`document.readyState==='complete'&&window.__vehicleReview?.game&&document.querySelector('.missionCard button')`,'mission selection');
  await evaluate(`document.querySelector('.missionCard button').click()`);
  const missionTitle=await waitFor(`document.querySelector('#missionSelect')?.classList.contains('hidden')&&document.querySelector('#missionTitle')?.textContent`,'mission start');
  const atlasStatus=await waitFor(`(()=>{const r=window.__vehicleReview?.renderer;const ua=r?.ukrainianVehicleAtlasStatus?.();const ru=r?.russianVehicleAtlasStatus?.();return ua?.ready&&!ua.degraded&&ru?.ready&&!ru.degraded?{ukraine:ua,russia:ru}:false;})()`,'paired vehicle atlases readiness');
  const captures=[];
  const reviews=[
    ['uaIfv',0,0.55,'ua-strategic-ifv-color.png',false],['uaIfv',0,1,'ua-command-ifv-color.png',false],['uaTank',0,1.45,'ua-inspection-tank-color.png',false],['uaTank',0,0.55,'ua-strategic-tank-value.png',true],
    ['ruIfv',1,0.55,'ru-strategic-ifv-color.png',false],['ruIfv',1,1,'ru-command-ifv-color.png',false],['ruTank',1,1.45,'ru-inspection-tank-color.png',false],['ruTank',1,0.55,'ru-strategic-tank-value.png',true],
  ];
  for(const [type,team,zoom,file,grayscale] of reviews){const entity=await setReview(type,team,zoom);if(entity.screenX<100||entity.screenX>1500||entity.screenY<120||entity.screenY>700)throw new Error(`${type} is outside review viewport: ${JSON.stringify(entity)}`);if(grayscale)await evaluate(`document.documentElement.style.filter='grayscale(1)'`);await delay(180);captures.push({type,team,zoom,file,grayscale,entity,bytes:await capture(file)});if(grayscale)await evaluate(`document.documentElement.style.filter=''`);}
  const failures=events.filter((event)=>event.method==='Runtime.exceptionThrown'||event.method==='Inspector.targetCrashed'||(event.method==='Log.entryAdded'&&event.params?.entry?.level==='error')||(event.method==='Network.loadingFailed'&&!event.params?.canceled));if(failures.length)throw new Error(`Paired vehicle mission review saw ${failures.length} runtime/network failure(s).`);
  await writeFile(resolve(artifacts,'paired-vehicle-mission-readability.json'),JSON.stringify({status:'passed',missionTitle,atlasStatus,viewport:{width:1600,height:1000},captures,review:{surface:'actual mission runtime',factions:['ukraine','russia'],types:['uaIfv','uaTank','ruIfv','ruTank'],zooms:[0.55,1,1.45],grayscale:true}},null,2));
  console.log(`[paired-vehicle-mission-readability] captured ${captures.length} reviews in ${missionTitle}`);
}catch(error){await writeFile(resolve(artifacts,'failure.log'),`${logs.join('')}\n${error.stack}\n`);throw error;}finally{socket?.close();if(!chromeExited)chrome.kill('SIGTERM');await Promise.race([chromeExit,delay(2000)]);if(!chromeExited)chrome.kill('SIGKILL');await new Promise((r)=>server.close(r));await rm(profile,{recursive:true,force:true});}
