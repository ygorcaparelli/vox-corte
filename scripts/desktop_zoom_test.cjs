const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ready, seekPreview } = require('./preview_test_helpers.cjs');

(async () => {
  const executablePath = process.env.FALA_TEST_EXE;
  if (!executablePath) throw Error('Informe FALA_TEST_EXE para testar o aplicativo empacotado.');
  const source = path.resolve('outputs/movimento-teste.mp4');
  const output = path.resolve('outputs/zoom-desktop-exportado.mp4');
  const project = path.resolve('outputs/zoom-desktop.falacorte.json');
  const hash = () => crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const before = hash();
  fs.writeFileSync(project, JSON.stringify({ version: 1, videoPath: source,
    edit: { words: [], cuts: [{ id: 'pause', start: 2, end: 3, label: 'Pausa' }] } }));
  const application = await electron.launch({ executablePath, args: [], timeout: 60000,
    env: { ...process.env, FALA_USER_DATA: path.resolve('.local/desktop-zoom-test') } });
  try {
    const page = await application.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByText('Processamento local', { exact: true }).waitFor({ timeout: 60000 });
    const health = await page.evaluate(async () => {
      const config = await window.desktop.config();
      return fetch(config.url + '/health', { headers: { Authorization: 'Bearer ' + config.token } }).then(r => r.json());
    });
    if (!health.ffmpeg || !health.whisper || !health.zooms) throw Error(JSON.stringify(health));
    await page.locator('input[type=file]').nth(1).setInputFiles(project);
    await ready(page, 7);
    await page.getByRole('button', { name: 'Zoom manual', exact: true }).click();
    await page.getByLabel('Início do zoom', { exact: true }).fill('4');
    await page.getByLabel('Fim do zoom', { exact: true }).fill('6');
    await page.getByLabel('Curva do zoom').selectOption('linear');
    await page.getByLabel('Escala final', { exact: true }).evaluate(bar => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(bar, '2');
      bar.dispatchEvent(new Event('input', { bubbles: true }));
      bar.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Aplicar zoom', exact: true }).click();
    await seekPreview(page, 5);
    await page.waitForFunction(() => Math.abs(Number(document.querySelector('.smooth-preview').dataset.zoom) - 1.5) < .02);
    await page.getByRole('button', { name: 'Zoom automático', exact: true }).click();
    if (await page.locator('[data-zoom-id]').count() !== 2) throw Error('Zoom automático não preservou o manual.');
    await application.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, output);
    await page.getByRole('button', { name: 'Exportar MP4', exact: true }).click();
    await page.getByText(/Exportação concluída:/).waitFor({ timeout: 60000 });
    if (!fs.existsSync(output) || fs.statSync(output).size < 1000 || hash() !== before || errors.length) {
      throw Error(errors.join('\n') || 'Falha na exportação ou arquivo original alterado.');
    }
    await page.screenshot({ path: 'outputs/desktop-zoom.png', fullPage: true });
    console.log('Electron empacotado OK: serviço incluído, importação, cortes, zoom manual/automático, prévia e exportação MP4; original preservado.');
  } finally {
    await application.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
