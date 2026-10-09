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
      await page.locator('img[src]').evaluateAll((images) => {
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
      assert(await page.locator('img[src]').evaluateAll((images) => images.every((image) => image.naturalWidth > 0)), 'Broken image');
      for (const button of await page.locator('a.button').all()) {
        const box = await button.boundingBox();
        if (box) assert(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'Button clipped');
      }
      for (const element of await page.locator('.reveal').all()) {
        await element.scrollIntoViewIfNeeded();
        await page.waitForFunction((node) => node.classList.contains('is-visible'), await element.elementHandle());
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => [...document.querySelectorAll('.hero-copy > *')].every((element) => Number(getComputedStyle(element).opacity) === 1));
      await page.waitForTimeout(850);
      await page.screenshot({ path: path.join(output, `${prefix}site-${viewport.width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${prefix}hero-${viewport.width}.png`) });
      checks.push(`Layout ${viewport.width}x${viewport.height}, no overflow or broken images`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => document.getElementById('hero-reel').currentTime > .5);
    const reel = await page.locator('#hero-reel').evaluate((video) => {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
      const context = canvas.getContext('2d'); context.drawImage(video, 0, 0, 64, 36);
      const pixels = context.getImageData(0, 0, 64, 36).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, muted: video.muted, colors: colors.size };
    });
    assert.equal(reel.width, 1280); assert.equal(reel.height, 720);
    assert(reel.duration >= 11 && reel.duration <= 13 && reel.muted && reel.colors > 30);
    await page.getByRole('button', { name: 'Pausar animações', exact: true }).click();
    assert(await page.locator('#hero-reel').evaluate((video) => video.paused));
    assert(await page.locator('html').evaluate((element) => element.classList.contains('motion-off')));
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Ativar animações', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#hero-reel').getAttribute('src'), null);
    await page.getByRole('button', { name: 'Ativar animações', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('hero-reel').paused);
    checks.push('Silent hero recording is nonblank, plays, pauses and remembers the preference');
    await page.locator('#experimente').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#experimente').classList.contains('is-playing'));
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => document.getElementById('sample-duration').textContent === '5,3 s');
    await page.getByRole('button', { name: 'Restaurar exemplo', exact: true }).click();
    assert.equal(await page.locator('#sample-duration').innerText(), '7,0 s');
    await page.getByRole('button', { name: 'Ver corte', exact: true }).click();
    assert.equal(await page.locator('#sample-duration').innerText(), '5,3 s');
    assert.equal(await page.locator('.sample-word[aria-pressed="true"]').count(), 2);
    await page.locator('[data-word="0"]').press('Enter');
    assert.equal(await page.locator('#sample-duration').innerText(), '4,7 s');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(3600);
    assert.equal(await page.locator('#sample-duration').innerText(), '4,7 s', 'Autoplay must not overwrite a manual edit');
    await page.locator('#sample-reset').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(output, `${prefix}interativo.png`) });
    assert.equal(await page.locator('#sample-duration').innerText(), '7,0 s');
    assert(await page.locator('#hero-reel').evaluate((video) => video.paused), 'Offscreen hero should pause');
    assert(await page.locator('.page-progress').evaluate((element) => getComputedStyle(element).transform !== 'matrix(0, 0, 0, 1, 0, 0)'));
    checks.push('Automatic cut illustration, manual word edits, keyboard, reset and offscreen pause work');
    await page.getByRole('tab', { name: /Encontre o ritmo/ }).click();
    assert.equal(await page.getByRole('tab', { name: /Encontre o ritmo/ }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#feature-image').getAttribute('src'), 'assets/editor.png');
    await page.getByRole('tab', { name: /Encontre o ritmo/ }).press('ArrowDown');
    assert.equal(await page.getByRole('tab', { name: /Continue de onde parou/ }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#feature-image').getAttribute('src'), 'assets/projetos.png');
    await page.getByRole('tab', { name: /Continue de onde parou/ }).press('Home');
    assert.equal(await page.getByRole('tab', { name: /Edite como você fala/ }).getAttribute('aria-selected'), 'true');
    checks.push('Feature tabs work with mouse and keyboard');
    await page.getByRole('button', { name: 'Ampliar captura do editor', exact: true }).click();
    assert(await page.getByRole('dialog').isVisible());
    assert((await page.locator('#capture-image').getAttribute('src')).endsWith('assets/transcricao.png'));
    await page.keyboard.press('Escape');
    assert(!(await page.getByRole('dialog').isVisible()));
    assert(await page.locator('.capture-open').evaluate((element) => element === document.activeElement));
    checks.push('Screenshot enlargement and Escape focus restoration work');
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
    await page.locator('#demo-video').evaluate((video) => { video.muted = true; return video.play(); });
    await page.waitForFunction(() => document.querySelector('#demo-video').currentTime > 1);
    const video = await page.locator('#demo-video').evaluate((element) => ({ width: element.videoWidth, height: element.videoHeight, duration: element.duration, error: element.error?.code }));
    assert.equal(video.width, 1080);
    assert.equal(video.height, 1920);
    assert(video.duration >= 29 && video.duration <= 31 && !video.error);
    await page.locator('#demo-video').evaluate((element) => element.pause());
    checks.push('Real demonstration MP4 decodes and plays');
    await context.clearPermissions();
    await context.grantPermissions([], { origin: base });
    await page.locator('#copy-hash').click();
    await page.getByText(/Não foi possível copiar automaticamente/).waitFor();
    checks.push('Clipboard denial has an accessible fallback');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    await page.reload();
    assert.equal(await page.locator('#hero-reel').getAttribute('src'), null);
    assert(await page.getByRole('button', { name: 'Animações desativadas pelo sistema', exact: true }).isDisabled());
    await page.locator('#experimente').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Ver corte', exact: true }).click();
    assert.equal(await page.locator('#sample-duration').innerText(), '5,3 s');
    assert(!(await page.locator('#experimente').evaluate((element) => element.classList.contains('is-playing'))));
    checks.push('Reduced-motion preference respected');
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(base);
    assert(await staticPage.locator('h1').isVisible());
    assert.equal(await staticPage.locator('[data-download]').count(), 2);
    assert.equal(await staticPage.locator('#hero-reel').getAttribute('src'), null);
    await staticContext.close();
    checks.push('Content and download links remain available without JavaScript');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, `${prefix}results.json`), JSON.stringify({ base, passed: checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks, errors }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
