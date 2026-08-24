#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = String(process.env.RELEASE_QA_COMMIT || process.env.GITHUB_SHA || '');
const driverPath = process.env.RELEASE_QA_DRIVER;
if (!driverPath) throw new Error('RELEASE_QA_DRIVER is required.');

const out = resolve(root, 'artifacts', 'release-browser-qa', 'chrome');
const host = '127.0.0.1';
const appPort = 4185;
const driverPort = 9520;
const pageUrl = `http://${host}:${appPort}/`;
const E = 'element-6066-11e4-a52e-4f735466cecf';
const CTRL = '\uE009';
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
const mime = { '.css':'text/css', '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.ogg':'audio/ogg' };
await mkdir(out, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, pageUrl).pathname);
    if (pathname === '/favicon.ico') { response.statusCode = 204; response.end(); return; }
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = resolve(root, requested);
    const rel = relative(root, file);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Invalid path');
    response.setHeader('content-type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch (error) {
    response.statusCode = 404;
    response.end(error.message);
  }
});
await new Promise((ready, failed) => { server.once('error', failed); server.listen(appPort, host, ready); });

const driverLog = [];
const driver = spawn(driverPath, [`--port=${driverPort}`], { stdio: ['ignore', 'pipe', 'pipe'] });
driver.stdout.on('data', (chunk) => driverLog.push(chunk.toString()));
driver.stderr.on('data', (chunk) => driverLog.push(chunk.toString()));
let exited = false;
driver.on('exit', () => { exited = true; });

async function http(method, path, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${driverPort}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type':'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok || payload?.value?.error) throw new Error(payload?.value?.message || `${method} ${path}: HTTP ${response.status}`);
    return payload.value;
  } finally { clearTimeout(timer); }
}

async function waitDriver() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) break;
    try { const status = await http('GET', '/status', undefined, 1200); if (status?.ready !== false) return; } catch {}
    await delay(200);
  }
  throw new Error(`ChromeDriver unavailable: ${driverLog.join('')}`);
}

let session = null;
const wd = (method, suffix, body, timeoutMs) => http(method, `/session/${session}${suffix}`, body, timeoutMs);
const js = (script, args = []) => wd('POST', '/execute/sync', { script, args });
async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if (await js(`return Boolean(${expression});`)) return; } catch {}
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function screenshot(name) {
  const data = await wd('GET', '/screenshot');
  await writeFile(join(out, name), Buffer.from(data, 'base64'));
  return name;
}
async function cdp(cmd, params) { return wd('POST', '/goog/cdp/execute', { cmd, params }); }
async function setMetrics(width, height, dpr = 1) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:dpr, mobile:false });
  await delay(180);
}
async function clearMetrics() { try { await cdp('Emulation.clearDeviceMetricsOverride', {}); } catch {} }
async function keyChord(key) {
  await wd('POST', '/actions', { actions:[{ type:'key', id:'kbd', actions:[
    { type:'keyDown', value:CTRL }, { type:'keyDown', value:key }, { type:'keyUp', value:key }, { type:'keyUp', value:CTRL },
  ] }] });
  await wd('DELETE', '/actions');
  await delay(250);
}
const zoomChanged = (before, after) => after.viewport.dpr > before.viewport.dpr || after.viewport.width < before.viewport.width;

async function menuSnapshot() {
  return js(`
    const rect=(element)=>{const r=element?.getBoundingClientRect();return r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null};
    const rgb=(value)=>{const m=String(value).match(/rgba?\\((\\d+)\\D+(\\d+)\\D+(\\d+)/);return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null};
    const luminance=(color)=>{const c=rgb(color)?.map(v=>{const n=v/255;return n<=0.03928?n/12.92:((n+0.055)/1.055)**2.4});return c?0.2126*c[0]+0.7152*c[1]+0.0722*c[2]:null};
    const ratio=(fg,bg)=>{const a=luminance(fg),b=luminance(bg);if(a===null||b===null)return null;const hi=Math.max(a,b),lo=Math.min(a,b);return(hi+0.05)/(lo+0.05)};
    const book=document.querySelector('.book'),bookStyle=getComputedStyle(book),background=bookStyle.backgroundColor;
    const textNodes=[document.querySelector('.book h1'),...document.querySelectorAll('.book > p')].filter(Boolean);
    const contrast=textNodes.map(node=>({text:(node.textContent||'').trim().slice(0,100),color:getComputedStyle(node).color,ratio:ratio(getComputedStyle(node).color,background),rect:rect(node)}));
    const card=document.querySelector('.skirmishMissionCard'),body=card?.children?.[1],action=card?.querySelector(':scope > button'),field=card?.querySelector('.skirmishSetupField'),select=field?.querySelector('select');
    return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},book:{rect:rect(book),background,borderImageSlice:bookStyle.borderImageSlice,color:bookStyle.color},contrast,skirmish:{card:rect(card),body:rect(body),action:rect(action),field:rect(field),select:rect(select),value:select?.value||null},horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
  `);
}

function validate(snapshot, label) {
  assert(snapshot.book?.rect?.width > 0, `${label}: book missing`);
  assert(!String(snapshot.book.borderImageSlice).includes('fill'), `${label}: parchment fill still active (${snapshot.book.borderImageSlice})`);
  assert(snapshot.contrast.length >= 2, `${label}: operation copy missing`);
  for (const item of snapshot.contrast) assert(item.ratio >= 4.5, `${label}: insufficient operation contrast ${item.ratio} for ${item.text}`);
  const { card, body, action, field, select } = snapshot.skirmish;
  assert(card && body && action && field && select, `${label}: skirmish geometry missing`);
  assert(select.left >= field.left - 0.5 && select.right <= field.right + 0.5, `${label}: battlefield select escapes its field`);
  assert(field.left >= body.left - 0.5 && field.right <= body.right + 0.5, `${label}: battlefield field escapes content column`);
  assert(select.left >= card.left - 0.5 && select.right <= card.right + 0.5, `${label}: battlefield select escapes card`);
  assert(action.left >= card.left - 0.5 && action.right <= card.right + 0.5, `${label}: action escapes card`);
  assert(!snapshot.horizontalOverflow, `${label}: page has horizontal overflow`);
  if (body.right <= action.left) assert(select.right <= action.left + 0.5, `${label}: battlefield select overlaps action column`);
}

const report = { schema:'fields-of-resolve.windows-chrome-menu-release-review', version:1, candidateCommit:commit, browser:'chrome', headed:true, runner:{os:process.env.ImageOS||process.platform,imageVersion:process.env.ImageVersion||null}, tester:'OpenAI assistant via native headed Windows Chrome automation and real application captures', status:'FAIL', viewports:[], zoom:null, screenshots:[] };

try {
  await waitDriver();
  const created = await http('POST', '/session', { capabilities:{ alwaysMatch:{ browserName:'chrome', 'goog:chromeOptions':{ args:['--disable-search-engine-choice-screen','--disable-dev-shm-usage'] } } } }, 60000);
  session = created?.sessionId || created?.value?.sessionId;
  report.capabilities = created?.capabilities || created?.value?.capabilities || {};
  assert(session, 'No Chrome session');
  await wd('POST', '/window/rect', { x:0, y:0, width:1440, height:900 });
  await wd('POST', '/url', { url:pageUrl });
  await waitFor(`document.readyState==='complete'&&document.querySelector('.book h1')&&document.querySelector('.skirmishMissionCard .skirmishSetupField select')`, 'operation and skirmish menu');

  for (const [width,height] of [[1280,720],[1920,1080],[900,760]]) {
    await setMetrics(width,height,1);
    const snapshot = await menuSnapshot();
    assert(snapshot.viewport.width===width&&snapshot.viewport.height===height, `viewport mismatch ${width}x${height}`);
    validate(snapshot, `${width}x${height}`);
    await js(`document.querySelector('.skirmishMissionCard')?.scrollIntoView({block:'center'});`);
    await delay(100);
    const file=`windows-chrome-menu-${width}x${height}.png`;
    report.screenshots.push(await screenshot(file));
    report.viewports.push({width,height,snapshot});
  }

  await clearMetrics();
  await wd('POST', '/window/rect', { x:0, y:0, width:1440, height:900 });
  const beforeZoom = await menuSnapshot();
  let shortcut = 'Ctrl+=';
  await keyChord('=');
  let afterZoom = await menuSnapshot();
  if (!zoomChanged(beforeZoom, afterZoom)) {
    shortcut = 'Ctrl++ fallback';
    await keyChord('+');
    afterZoom = await menuSnapshot();
  }
  validate(afterZoom, 'browser zoom');
  assert(zoomChanged(beforeZoom, afterZoom), `Native Chrome zoom shortcut did not change browser scale: before=${JSON.stringify(beforeZoom.viewport)} after=${JSON.stringify(afterZoom.viewport)}`);
  report.zoom = { before:beforeZoom.viewport, after:afterZoom.viewport, shortcut, status:'PASS' };
  await keyChord('0');

  report.status='PASS';
  await writeFile(join(out,'menu-ui-review.json'), `${JSON.stringify(report,null,2)}\n`);
  console.log(`[windows-chrome-menu-release-review] PASS ${report.capabilities?.browserVersion||'unknown'} operation contrast, skirmish containment, responsive layout, browser zoom`);
} catch (error) {
  report.error=error.stack||String(error);
  try { if(session) report.screenshots.push(await screenshot('windows-chrome-menu-failure.png')); } catch {}
  await writeFile(join(out,'menu-ui-review.json'), `${JSON.stringify(report,null,2)}\n`);
  throw error;
} finally {
  await clearMetrics();
  if(session) try { await http('DELETE',`/session/${session}`,undefined,5000); } catch {}
  if(!exited) driver.kill('SIGTERM');
  await delay(300);
  if(!exited) driver.kill('SIGKILL');
  await new Promise((done)=>server.close(done));
}
