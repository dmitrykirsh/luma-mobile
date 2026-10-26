// Отладка страницы Luma TV на телевизоре: node tools/cdp.mjs "<js-выражение>" [--shot файл.png]
// Требует: adb connect, приложение запущено. Пробрасывает devtools-сокет WebView на локальный порт.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const ADB = process.env.ADB || 'C:/Android/sdk/platform-tools/adb.exe';
const DEV = process.env.PHONE || '192.168.0.67:38789';
const sh = (c) => execSync(`"${ADB}" -s ${DEV} ${c}`, { encoding: 'utf8' });
const pid = sh(`shell pidof ${process.env.PKG || 'ws.luma.mobile'}`).trim().split(/\s+/)[0]; const sock = pid && 'webview_devtools_remote_' + pid;   // PKG=ws.luma.launcher для лаунчера
if (!sock) { console.error('нет webview devtools (приложение запущено?)'); process.exit(2); }
sh(`forward tcp:9444 localabstract:${sock}`);
const list = await (await fetch('http://127.0.0.1:9444/json')).json();
const page = list.find((p) => p.type === 'page' && /liftw\.ws\/index/.test(p.url)) || list.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } else if (j.method === 'Runtime.consoleAPICalled' && process.env.LOG) console.log('[console]', j.params.args.map((a) => a.value ?? a.description).join(' ')); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
const args = process.argv.slice(2);
const shot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const expr = args.filter((a, i) => a !== '--shot' && args[i - 1] !== '--shot').join(' ');
if (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result.result.value ?? r.result.exceptionDetails ?? r.result.result, null, 1));
}
if (shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shot, Buffer.from(r.result.data, 'base64')); }
ws.close(); process.exit(0);
