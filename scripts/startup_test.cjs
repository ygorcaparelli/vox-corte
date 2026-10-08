const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function run(primary = true, portError = false) {
  const app = new EventEmitter();
  Object.assign(app, { isPackaged: false, getPath: () => '.local/startup-test', requestSingleInstanceLock: () => primary, whenReady: () => Promise.resolve(), quit: () => { app.quitCalled = true; } });
  const handlers = new Map(), windows = [], logs = [];
  let healthResolve, fetchOptions;
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; windows.push(this); }
    loadFile() { this.loaded = true; return Promise.resolve(); }
    isMinimized() { return true; }
    restore() { this.restored = true; }
    show() { this.shown = true; }
    focus() { this.focused = true; }
  }
  const worker = new EventEmitter();
  worker.exitCode = null; worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter();
  const mocks = {
    electron: { app, BrowserWindow: Window, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, dialog: { showErrorBox: () => {}, showOpenDialog: () => {}, showSaveDialog: () => {} } },
    'node:fs': { existsSync: () => true, mkdirSync: () => {}, appendFileSync: (_file, message) => logs.push(message) },
    'node:child_process': { spawn: () => worker },
    'node:net': { createServer: () => {
      const server = new EventEmitter();
      server.listen = (_port, _host, callback) => { if(portError) queueMicrotask(() => server.emit('error', new Error('Porta indisponivel'))); else queueMicrotask(callback); };
      server.address = () => ({ port: 9876 }); server.close = callback => callback(); return server;
    } }
  };
  vm.runInNewContext(source, {
    require: name => mocks[name] || require(name), __dirname: path.resolve('electron'),
    process: { env: {}, on: () => {} }, console, setTimeout,
    AbortSignal: { timeout: ms => ({ timeout: ms }) },
    fetch: (_url, options) => { fetchOptions = options; return new Promise(resolve => { healthResolve = resolve; }); }
  });
  await settle();
  if (!primary) { assert.equal(windows.length, 0); assert.equal(app.quitCalled, true); return; }
  assert.equal(windows.length, 1);
  assert.equal(windows[0].loaded, true, 'Interface deve carregar antes do servico responder');
  let ready = false;
  const config = handlers.get('config')().then(result => { ready = true; return result; });
  await settle();
  if(portError) {
    assert.match((await config).error, /Porta indisponivel/);
  } else {
    assert.equal(ready, false, 'Configuracao deve aguardar o servico, sem bloquear a janela');
    assert.equal(fetchOptions.signal.timeout, 1500);
    healthResolve({ ok: true, json: async () => ({ pid: 420 }) });
    assert.equal((await config).url, 'http://127.0.0.1:9876');
    app.emit('second-instance');
    assert.equal(windows[0].restored && windows[0].shown && windows[0].focused, true);
  }
  assert.ok(logs.length);
}
(async () => { await run(); await run(false); await run(true, true); console.log('Inicializacao OK: janela antes do servico, configuracao sincronizada, timeout HTTP, instancia unica, foco e erro de porta visivel.'); })().catch(error => { console.error(error); process.exitCode = 1; });
