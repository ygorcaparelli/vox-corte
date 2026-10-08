const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
// Keep the existing data directory when changing the public application name.
app.setPath('userData', process.env.FALA_USER_DATA || path.join(app.getPath('appData'), 'fala-corte'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
app.setName('Vox Corte');
if (process.env.FALA_TEST_LOG) {
  fs.appendFileSync(process.env.FALA_TEST_LOG, 'main carregado\n');
  process.on('uncaughtException', e => fs.appendFileSync(process.env.FALA_TEST_LOG, e.stack + '\n'));
  process.on('unhandledRejection', e => fs.appendFileSync(process.env.FALA_TEST_LOG, String(e) + '\n'));
}
let worker, config, backendPid, mainWindow, backendReady, quitting = false, startupError = '';
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const logPath = path.join(app.getPath('userData'), 'inicializacao.log');
function log(message) {
  try { fs.mkdirSync(path.dirname(logPath), { recursive: true }); fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`); } catch {}
}
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
async function startBackend() {
  const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const token = crypto.randomBytes(32).toString('hex');
  const bundled = path.join(root, 'runtime', 'python.exe');
  const venv = path.join(root, '.venv', 'Scripts', 'python.exe');
  const python = process.env.FALA_PYTHON || (fs.existsSync(bundled) ? bundled : fs.existsSync(venv) ? venv : 'python');
  config = { url: `http://127.0.0.1:${port}`, token };
  log(`Iniciando servico com ${python}, porta ${port}`);
  worker = spawn(python, [path.join(root, 'backend', 'app.py'), '--port', String(port)], { windowsHide: true, env: { ...process.env, FALA_TOKEN: token, FALA_DATA: path.join(app.getPath('userData'), 'data') } });
  worker.on('error', e => { startupError = `Não foi possível iniciar Python: ${e.message}. Consulte ${logPath}.`; log(startupError); });
  worker.on('exit', (code, signal) => log(`Servico encerrado: codigo ${code}, sinal ${signal}`));
  worker.stdout.on('data', d => log(String(d).trim()));
  worker.stderr.on('data', d => { startupError = String(d).slice(-2000); log(String(d).trim()); });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${config.url}/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1500) }); if (r.ok) { backendPid = (await r.json()).pid; startupError = ''; log('Servico local pronto'); return; } } catch {}
    if (worker.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`O serviço local não iniciou. ${startupError || 'Tempo limite atingido.'} Consulte ${logPath}.`);
}
ipcMain.handle('config', async () => { await backendReady; return { ...config, error: startupError }; });
ipcMain.handle('open-video', async () => { const r = await dialog.showOpenDialog({ filters: [{ name: 'Vídeos', extensions: ['mp4','mov','mkv','avi','webm','m4v'] }], properties: ['openFile'] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('save-video', async () => { const r = await dialog.showSaveDialog({ defaultPath: 'video-editado.mp4', filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] }); return r.canceled ? null : r.filePath; });
if (primary) app.whenReady().then(() => {
  log('Electron pronto; abrindo janela');
  mainWindow = new BrowserWindow({ title:'Vox Corte', icon:path.join(root,app.isPackaged?'app.asar/assets/voxcorte-app.ico':'assets/voxcorte-app.ico'), width: 1440, height: 940, minWidth: 900, minHeight: 650, backgroundColor: '#101214', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.once('ready-to-show', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); log('Janela visivel'); } });
  mainWindow.webContents.on('render-process-gone', (_event, details) => { log(`Falha no player: ${JSON.stringify(details)}`); dialog.showErrorBox('Falha na interface', `A interface encerrou. Consulte ${logPath}.`); });
  backendReady = startBackend().catch(e => { startupError = e.message; log(startupError); });
  const loading = process.env.FALA_DEV_URL ? mainWindow.loadURL(process.env.FALA_DEV_URL) : mainWindow.loadFile(path.join(root, app.isPackaged ? 'app.asar/dist/index.html' : 'dist/index.html'));
  loading.then(() => log('Interface carregada')).catch(e => { log(e.stack || e.message); dialog.showErrorBox('Não foi possível abrir Fala Corte', `${e.message}\nConsulte ${logPath}.`); });
}).catch(e => { log(e.stack || e.message); dialog.showErrorBox('Erro ao iniciar Fala Corte', `${e.message}\nConsulte ${logPath}.`); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting || !worker) return;
  event.preventDefault(); quitting = true;
  (async () => {
    try { await fetch(config.url + '/shutdown', { method: 'POST', headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(5000) }); }
    catch { try { if (backendPid) process.kill(backendPid); } catch {} }
    try { worker.kill(); } catch {}
    app.quit();
  })();
});
