const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(process.env.FALA_UI_URL||'http://127.0.0.1:5174/?porta=8768');
    await page.getByText('Processamento local',{exact:true}).waitFor();
    const project={version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[{id:'red',text:'Primeira',start:0,end:1,paragraph:0},{id:'blue',text:'Seguinte',start:4,end:5,paragraph:1}],cuts:[{id:'middle',start:2,end:4,label:'Pausa com respiração'}]}};
    fs.writeFileSync('outputs/projeto-previa-real.json',JSON.stringify(project));
    await page.locator('input[type=file]').nth(1).setInputFiles(path.resolve('outputs/projeto-previa-real.json'));
    const ready=async duration=>page.waitForFunction(d=>{const v=document.querySelector('video');return v&&v.readyState>=2&&!v.classList.contains('pending-video')&&!document.querySelector('.job')&&Math.abs(v.duration-d)<.12;},duration,{timeout:60000});
    await ready(4);
    const editedSrc=await page.locator('video').getAttribute('src');
    async function pixel(t){
      await page.evaluate(t=>{const v=document.querySelector('video');v.pause();v.currentTime=t;},t);
      await page.waitForFunction(t=>{const v=document.querySelector('video');return !v.seeking&&Math.abs(v.currentTime-t)<.02;},t);
      return page.evaluate(()=>{const v=document.querySelector('video'),c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,320,180);return [...ctx.getImageData(160,90,1,1).data];});
    }
    const red=await pixel(.5),blue=await pixel(2.5);
    if(!(red[0]>200&&red[1]<40&&blue[2]>200&&blue[1]<40))throw Error('Prévia contém frames incorretos: '+JSON.stringify({red,blue}));
    if(await page.evaluate(()=>document.querySelector('video').currentTime)>3)throw Error('Arrastar a barra editada levou ao final');
    await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;v.currentTime=1.8;await v.play();});
    await page.waitForFunction(()=>document.querySelector('video').currentTime>2.1);
    await page.evaluate(()=>document.querySelector('video').pause());
    if(await page.evaluate(()=>document.querySelector('video').ended))throw Error('Play saltou para o fim');
    await page.locator('[data-word-id="blue"]').click();
    await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-2)<.06);
    await page.getByRole('button',{name:'Original',exact:true}).click();await ready(6);
    const green=await pixel(3);
    if(!(green[1]>80&&green[0]<40&&green[2]<40))throw Error('Original não restaurou frames verdes');
    await page.getByRole('button',{name:'Editada',exact:true}).click();await ready(4);
    if(await page.locator('video').getAttribute('src')!==editedSrc)throw Error('Troca de modo não reutilizou prévia');
    await page.getByRole('button',{name:'Restaurar este corte',exact:true}).click();await ready(6);
    await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready(4);
    await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
    await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
    await page.screenshot({path:'outputs/previa-real-desktop.png',fullPage:true});
    await page.setViewportSize({width:600,height:900});
    await page.screenshot({path:'outputs/previa-real-compacta.png',fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Layout transborda');
    const unsafe={version:1,videoPath:path.resolve('outputs/respiracoes-teste.mp4'),edit:{words:[{id:'short',text:'Fala',start:.9,end:1.1,paragraph:0}],cuts:[]}};
    fs.writeFileSync('outputs/projeto-protecao-cortes.json',JSON.stringify(unsafe));
    await page.locator('input[type=file]').nth(1).setInputFiles(path.resolve('outputs/projeto-protecao-cortes.json'));
    await page.locator('[data-word-id="short"]').waitFor();await ready(6);
    await page.getByRole('button',{name:'Excluir silêncios e respirações',exact:true}).click();
    await page.getByText(/A análise removeria mais de 80%/).waitFor({timeout:60000});
    if(await page.locator('.cut-row').count())throw Error('Análise suspeita excluiu quase todo o vídeo');
    if(errors.length)throw Error(errors.join('\n'));
    console.log('Prévia real OK: 6 -> 4 s, vermelho -> azul sem verde, busca no meio sem salto ao fim, Play, palavra sincronizada, Original 6 s com verde, cache, restaurar/desfazer, exportação e layout.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
