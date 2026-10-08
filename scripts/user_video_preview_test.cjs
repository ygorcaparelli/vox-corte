const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
  const jobs=path.join(process.env.APPDATA,'fala-corte/data/jobs');
  const payloads=fs.readdirSync(jobs).filter(n=>n.endsWith('.request.json')).map(n=>({mtime:fs.statSync(path.join(jobs,n)).mtimeMs,payload:JSON.parse(fs.readFileSync(path.join(jobs,n),'utf8'))}));
  const payload=payloads.filter(x=>x.payload.kind==='export'&&x.payload.cuts?.length===779).sort((a,b)=>b.mtime-a.mtime)[0].payload;
  const source=fs.readdirSync('.local/imports').map(n=>path.resolve('.local/imports',n)).filter(p=>fs.statSync(p).size>2e9)[0];
  const fixture=path.resolve('outputs/projeto-video-completo-web.json');
  fs.writeFileSync(fixture,JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts:payload.cuts}}));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();
  try{
    await page.goto(process.env.FALA_UI_URL||'http://127.0.0.1:5175/?porta=8770');
    await page.getByText('Processamento local',{exact:true}).waitFor();
    await page.locator('input[type=file]').nth(1).setInputFiles(fixture);
    await ready(page,1307.496);const mediaSource=await page.locator('video').getAttribute('src');
    await page.evaluate(()=>document.querySelector('video').muted=true);await seekPreview(page,650);
    const pixelVariance=await page.evaluate(()=>{const v=document.querySelector('video'),c=document.createElement('canvas');c.width=64;c.height=36;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,64,36);const d=ctx.getImageData(0,0,64,36).data;return Math.max(...d.filter((_,i)=>i%4!==3))-Math.min(...d.filter((_,i)=>i%4!==3));});
    if(pixelVariance<10)throw Error('Previa sem imagem');
    await page.evaluate(()=>document.querySelector('video').play());
    await page.waitForFunction(()=>Number(document.querySelector('.player-position').value)>651);
    await page.evaluate(()=>document.querySelector('video').pause());
    await page.locator('[data-cut-id]').nth(400).getByTitle('Localizar corte no original').click();
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v.readyState>=2&&!v.seeking&&Math.abs(v.duration-2010.52)<.15;});
    if(await page.getByRole('alert').count()||errors.length)throw Error(errors.join('\n')||'Erro durante processamento');
    if(await page.locator('video').getAttribute('src')!==mediaSource)throw Error('Revisao trocou a fonte');
    const report={complete:true,cuts:779,elapsedSeconds:(Date.now()-started)/1000,editedDuration:await page.locator('.player-position').evaluate(e=>Number(e.max)),pixelVariance,seekAndPlay:true,sourceReused:true};
    fs.writeFileSync('outputs/previa-video-completo-web.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
