// SOLMAR v4 — headless probe: serves game/, drives headless Chrome over CDP
// (Node stdlib + global WebSocket), collects console errors / exceptions /
// failed requests per shot, waits for window.__shotReady, captures 1280x720
// JPEG screenshots into screenshots/. Usage: node probe.mjs [shot|all]
import { spawn, execFile } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8123;
const CHROME = process.env.CHROME || `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const SHOTS = [
  { name: 'dawn', file: '1-dawn.jpg' },
  { name: 'heist', file: '2-heist.jpg' },
  { name: 'storm', file: '3-storm.jpg' },
  { name: 'night', file: '4-night.jpg' },
];
const only = process.argv[2] || 'all';
const targets = only === 'all' ? SHOTS : SHOTS.filter((s) => s.name === only);
if (!targets.length) { console.error('unknown shot', only); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
await sleep(1500);

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,720', '--remote-debugging-port=9222',
  '--user-data-dir=/tmp/solmar-v4-chrome-profile-' + Date.now(),
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });
await sleep(4000);

let idSeq = 0;
const pending = new Map();
let ws;
async function connect() {
  const list = await getJson('http://127.0.0.1:9222/json/list');
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) onEvent(msg);
  };
}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++idSeq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const errors = [], exceptions = [], failedReqs = [], consoleErrs = [];
function onEvent(msg) {
  if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception');
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrs.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (msg.method === 'Network.loadingFailed') {
    failedReqs.push(`${msg.params.errorText} ${msg.params.type || ''}`);
  } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    failedReqs.push(`${msg.params.response.status} ${msg.params.response.url}`);
  }
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
}

await connect();
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

const results = {};
for (const shot of targets) {
  errors.length = 0; exceptions.length = 0; failedReqs.length = 0; consoleErrs.length = 0;
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?shot=${shot.name}&seed=7` });
  const t0 = Date.now();
  let ready = false, lastState = '';
  while (Date.now() - t0 < 150000) {
    await sleep(2000);
    try {
      ready = await evalJs('window.__shotReady === true');
      lastState = await evalJs('(window.__game && window.__game.player) ? ("health " + window.__game.player.health + " wanted " + window.__game.police.wanted + " mission " + window.__game.missions.index) : "no-game"');
    } catch { /* page still loading */ }
    console.log(`[${shot.name}] poll t=${Math.round((Date.now() - t0) / 1000)}s ready=${ready} state=${lastState} errs=${consoleErrs.length} exc=${exceptions.length} failed=${failedReqs.length}`);
    if (ready) break;
  }
  await sleep(2500); // let bloom/SSAO settle one more frame
  const shot2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  const buf = Buffer.from(shot2.result.data, 'base64');
  mkdirSync(join(here, 'screenshots'), { recursive: true });
  writeFileSync(join(here, 'screenshots', shot.file), buf);
  results[shot.name] = {
    ready, sizeBytes: buf.length, state: lastState,
    consoleErrors: [...consoleErrs], exceptions: [...exceptions], failedRequests: [...failedReqs],
    ms: Date.now() - t0,
  };
  console.log(JSON.stringify({ shot: shot.name, ...results[shot.name] }, null, 1));
}
console.log('SUMMARY', JSON.stringify(results, null, 1));
chrome.kill('SIGKILL');
server.kill('SIGKILL');
process.exit(0);
