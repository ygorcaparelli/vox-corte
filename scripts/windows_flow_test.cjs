const { chromium }=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const source=fs.readdirSync('.local/imports').map(name=>path.resolve('.local/imports',name)).filter(p=>fs.statSync(p).size>2e9).at(-1);
  if(!source)throw Error('Fixture grande ausente');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();let uploads=0;
    page.on('request',r=>{if(r.url().endsWith('/upload'))uploads++;});
    // Exercita a ponte desktop com API real; nao valida uma janela Electron nativa.
    await page.addInitScript(file=>{window.desktop={config:async()=>({url:'http://127.0.0.1:8769',token:'development-local'}),openVideo:async()=>file,filePath:()=>file,saveVideo:async()=>null};},source);
    await page.goto('http://127.0.0.1:5174/?porta=8769');
    await page.getByText('Processamento local',{exact:true}).waitFor();
    const begin=Date.now();await page.getByRole('button',{name:'Importar',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,null,{timeout:15000});
    const loadedMs=Date.now()-begin;
    if(uploads)throw Error('Ponte desktop copiou o video por upload');
    const duration=await page.evaluate(()=>document.querySelector('video').duration);
    if(duration<2000)throw Error('Arquivo grande incorreto');
    await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});
    await page.waitForFunction(()=>document.querySelector('video').currentTime>1.5,null,{timeout:15000});
    await page.evaluate(()=>document.querySelector('video').pause());
    const quality=await page.evaluate(()=>{const q=document.querySelector('video').getVideoPlaybackQuality();return {total:q.totalVideoFrames,dropped:q.droppedVideoFrames};});
    const cancel=page.getByRole('button',{name:'Cancelar',exact:true});
    if(await cancel.count()){await cancel.click();await page.waitForFunction(()=>!document.querySelector('.job'));}
    const result={fixtureGB:fs.statSync(source).size/1e9,desktopBridgeImportMs:loadedMs,durationSeconds:duration,uploads,playbackQuality:quality,nativeWindowVerified:false};
    fs.writeFileSync('outputs/windows-flow-test.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
