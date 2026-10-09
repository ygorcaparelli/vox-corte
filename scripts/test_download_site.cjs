const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', 'docs');
const output = path.resolve(__dirname, '..', 'outputs', 'site-qa');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const target = file === root ? path.join(root, 'index.html') : file;
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(response);
});

(async () => {
  let browser;
  const checks = [];
  try {
    fs.mkdirSync(output, { recursive: true });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const live = process.argv.includes('--live');
    const base = live ? 'https://ygorcaparelli.github.io/vox-corte/' : `http://127.0.0.1:${server.address().port}/`;
    const prefix = live ? 'publico-' : '';
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      await page.goto(base);
      await page.locator('img').evaluateAll((images) => {
        for (const image of images) image.loading = 'eager';
        return Promise.race([
          Promise.all(images.map((image) => image.decode())),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Image decode timed out')), 15000)),
        ]);
      });
      assert.equal(await page.title(), 'Vox Corte | Edite pela fala');
      assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR');
      assert.equal(await page.locator('h1').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      assert(await page.locator('.principles').evaluate((element) => element.getBoundingClientRect().top < innerHeight), 'No hint of the next section');
      assert(await page.locator('img').evaluateAll((images) => images.every((image) => image.naturalWidth > 0)), 'Broken image');
      for (const button of await page.locator('a.button').all()) {
        const box = await button.boundingBox();
        if (box) assert(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'Button clipped');
      }
      await page.screenshot({ path: path.join(output, `${prefix}site-${viewport.width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${prefix}hero-${viewport.width}.png`) });
      checks.push(`Layout ${viewport.width}x${viewport.height}, no overflow or broken images`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: /Encontre o ritmo/ }).click();
    assert.equal(await page.getByRole('tab', { name: /Encontre o ritmo/ }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#feature-image').getAttribute('src'), 'assets/editor.png');
    await page.getByRole('tab', { name: /Encontre o ritmo/ }).press('ArrowDown');
    assert.equal(await page.getByRole('tab', { name: /Continue de onde parou/ }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#feature-image').getAttribute('src'), 'assets/projetos.png');
    await page.getByRole('tab', { name: /Continue de onde parou/ }).press('Home');
    assert.equal(await page.getByRole('tab', { name: /Edite como você fala/ }).getAttribute('aria-selected'), 'true');
    checks.push('Feature tabs work with mouse and keyboard');
    await page.getByText('Origem e verificação do instalador', { exact: true }).click();
    await page.getByRole('button', { name: 'Copiar hash', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'd0616370f81712c499cd18b006d1565164d300f24629db830c844766f13f6c6d');
    await page.getByText('Hash copiado.', { exact: true }).waitFor();
    checks.push('SHA-256 copies correctly');
    const checksum = await context.request.get(base + 'downloads/SHA256SUMS.txt');
    assert.equal(checksum.status(), 200);
    assert((await checksum.text()).startsWith(await page.locator('#installer-hash').innerText()));
    for (const url of await page.locator('[data-download]').evaluateAll((links) => links.map((link) => link.href))) {
      assert.equal(url, 'https://github.com/ygorcaparelli/vox-corte/releases/download/v1.12.2/Vox-Corte-Instalar-1.12.2.exe');
    }
    checks.push('Download URLs, version and checksum agree');
    await page.getByText('Excluir o texto realmente corta o vídeo?', { exact: true }).click();
    assert(await page.locator('.faq-list details[open]').innerText().then((text) => text.includes('áudio e vídeo')));
    checks.push('FAQ disclosure works');
    await page.locator('video').evaluate((video) => { video.muted = true; return video.play(); });
    await page.waitForFunction(() => document.querySelector('video').currentTime > 1);
    const video = await page.locator('video').evaluate((element) => ({ width: element.videoWidth, height: element.videoHeight, duration: element.duration, error: element.error?.code }));
    assert.equal(video.width, 1080);
    assert.equal(video.height, 1920);
    assert(video.duration >= 29 && video.duration <= 31 && !video.error);
    await page.locator('video').evaluate((element) => element.pause());
    checks.push('Real demonstration MP4 decodes and plays');
    await context.clearPermissions();
    await context.grantPermissions([], { origin: base });
    await page.locator('#copy-hash').click();
    await page.getByText(/Não foi possível copiar automaticamente/).waitFor();
    checks.push('Clipboard denial has an accessible fallback');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    checks.push('Reduced-motion preference respected');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, `${prefix}results.json`), JSON.stringify({ base, passed: checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks, errors }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
