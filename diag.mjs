// Quick diagnostic: load one shot URL, print first exception + failed request + whether __game exists, then exit.
import { spawn, execSync } from 'node:child_process';
const PORT = 8124;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const url = process.argv[2] || `http://127.0.0.1:${PORT}/?shot=dawn&seed=7`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profDir = `/tmp/solmar-v4-diag-profile-${Date.now()}`;
try { execSync(`rm -rf ${profDir}`); } catch { /* ignore */ }
const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: new URL('.', import.meta.url).pathname, stdio: 'ignore' });
await sleep(1200);
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=1280,720', '--remote-debugging-port=9223',
  '--user-data-dir=' + profDir, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
await sleep(3500);
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') {
    console.log('EXCEPTION:', JSON.stringify(m.params.exceptionDetails, null, 1).slice(0, 3000));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    console.log('CONSOLE-ERROR:', m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  } else if (m.method === 'Network.loadingFailed') {
    console.log('LOAD-FAILED:', m.params.errorText);
  } else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    console.log('HTTP>=400:', m.params.response.status, m.params.response.url);
  }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Page.navigate', { url });
for (let k = 0; k < 20; k++) {
  await sleep(3000);
  const r = await send('Runtime.evaluate', { expression: '({ready: window.__shotReady, game: !!window.__game, err: window.__bootError || null})', returnByValue: true });
  console.log(`t=${(k + 1) * 3}s`, JSON.stringify(r.result?.result?.value));
  if (r.result?.result?.value?.game) break;
}
chrome.kill('SIGKILL'); server.kill('SIGKILL');
process.exit(0);
