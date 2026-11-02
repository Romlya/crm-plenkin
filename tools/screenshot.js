'use strict';

/**
 * Dev-инструмент: скриншоты страниц CRM через Chrome DevTools Protocol.
 * Запуск: node tools/screenshot.js <url> <out.png> [width] [height]
 * Требует установленный Chrome/Edge и Node 22+ (global WebSocket).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const BROWSER = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9333);
const URL = process.argv[2] || 'http://localhost:7799/#/dashboard';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'shot.png');
const WIDTH = Number(process.argv[4] || 1440);
const HEIGHT = Number(process.argv[5] || 1000);
const WAIT = Number(process.env.SHOT_WAIT || 2500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(pathname, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`, { method });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const text = message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ');
        this.logs.push(`[${message.params.type}] ${text}`);
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = message.params.exceptionDetails;
        this.logs.push(`[exception] ${detail.exception?.description || detail.text}`);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 20000);
    });
  }
}

async function main() {
  const profile = path.join(os.tmpdir(), `crm-cdp-${Date.now()}`);
  const child = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      version = await getJson('/json/version');
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('Браузер не запустился');

  const target = await getJson('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 600,
  });
  await cdp.send('Page.navigate', { url: URL });
  await sleep(WAIT);

  if (process.env.SHOT_JS) {
    await cdp.send('Runtime.evaluate', { expression: process.env.SHOT_JS, awaitPromise: true });
    await sleep(900);
  }

  const state = await cdp.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      appHidden: document.getElementById('app')?.classList.contains('hidden'),
      authHidden: document.getElementById('auth')?.classList.contains('hidden'),
      bootDone: document.getElementById('boot')?.classList.contains('done'),
      title: document.title,
      text: (document.body.innerText || '').slice(0, 400)
    })`,
    returnByValue: true,
  });

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log('STATE', state.result.value);
  if (cdp.logs.length) console.log('CONSOLE\n' + cdp.logs.slice(-15).join('\n'));
  console.log('SAVED', OUT);

  ws.close();
  child.kill();
  await sleep(300);
}

main().catch((error) => {
  console.error('ERROR', error.message);
  process.exitCode = 1;
});
