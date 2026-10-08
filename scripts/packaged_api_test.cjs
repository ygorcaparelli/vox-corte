const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

(async () => {
  const port = new URL(process.env.FALA_UI_URL).searchParams.get('porta');
  const url = 'http://127.0.0.1:' + port;
  async function api(endpoint, data) {
    const response = await fetch(url + endpoint, { method: data ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer development-local', 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined });
    if (!response.ok) throw Error(await response.text());
    return response.json();
  }
  const health = await api('/health');
  if (!health.ffmpeg || !health.whisper || !health.zooms) throw Error(JSON.stringify(health));
  const source = path.resolve('outputs/movimento-teste.mp4');
  const hash = () => crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  const before = hash();
  const video = await api('/videos', { path: source });
  const output = path.resolve('outputs/zoom-api-empacotada.mp4');
  const job = await api('/jobs', { kind: 'export', videoId: video.id, output,
    cuts: [{ start: 2, end: 3 }],
    zooms: [{ id: 'z', start: 5, end: 7, from: 1, to: 2, x: .5, y: .5, curve: 'linear' }] });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const status = await api('/jobs/' + job.id);
    if (status.state === 'error' || status.state === 'cancelled') throw Error(status.message);
    if (status.state === 'done') {
      const exported = await api('/videos', { path: output, previewResult: true });
      if (Math.abs(exported.duration - 7) > .07 || hash() !== before) throw Error('Duracao incorreta ou original alterado.');
      console.log('API empacotada OK: autenticacao, dependencias, importacao nativa, cortes, zoom e exportacao MP4 de 7 s; original preservado.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('Exportacao excedeu o tempo limite.');
})().catch(error => { console.error(error); process.exitCode = 1; });
