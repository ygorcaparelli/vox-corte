const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],jobs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/jobs'))jobs.push(r.postDataJSON().kind);});
 const project=path.resolve('outputs/projeto-instantaneo.json');
 fs.writeFileSync(project,JSON.stringify({version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[],cuts:[{id:'middle',start:2,end:4,label:'Pausa'},{id:'tail',start:5.5,end:6,label:'Final'}]}}));
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles(project);await ready(page,3.5);
  const source=await page.locator('video').getAttribute('src');
  if(jobs.includes('preview'))throw Error('Importar projeto gerou previa codificada');
  await seekPreview(page,2.2);
  if(Math.abs(Number(await page.locator('.smooth-preview').getAttribute('data-original-time'))-4.2)>.08)throw Error('Scrub editado usa tempo original ou pula ao fim');
  await page.locator('.clip-editor').scrollIntoViewIfNeeded();
  const handle=await page.getByRole('button',{name:'Fim do clipe 1',exact:true}).boundingBox(),scale=Number(await page.locator('.clip-canvas').getAttribute('data-scale'));
  await page.mouse.move(handle.x+handle.width/2,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+scale,handle.y+20,{steps:10});
  const start=Date.now();await page.mouse.up();await ready(page,4.5);const elapsed=Date.now()-start;
  if(elapsed>1500||await page.locator('.job').count())throw Error('Recuperar borda nao foi imediato: '+elapsed+' ms');
  await seekPreview(page,2.5);const green=await page.locator('.smooth-preview').evaluate(v=>{const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.drawImage(v,0,0,8,8);return [...x.getImageData(4,4,1,1).data];});
  if(green[1]<70||green[0]>40)throw Error('Trecho recuperado nao aparece');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready(page,3.5);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();await ready(page,4.5);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready(page,3.5);
  await page.getByRole('button',{name:'Fim do clipe 1',exact:true}).focus();
  for(let i=0;i<5;i++){
   await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.player-position').max)-3.54)<.005);
   await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.player-position').max)-3.5)<.005);
  }
  await ready(page,3.5);if(await page.locator('video').getAttribute('src')!==source||jobs.includes('preview'))throw Error('Ajuste recarregou ou recodificou o video');
  await seekPreview(page,1.6);
  await page.evaluate(async()=>{
   window.previewSamples=[];
   const start=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(when,offset,duration){
    const data=this.buffer.getChannelData(0),rate=this.buffer.sampleRate,first=Math.round(offset*rate),last=Math.min(data.length,first+Math.round(duration*rate));let crossings=0;
    for(let i=first+1;i<last;i++)if(data[i-1]<=0&&data[i]>0)crossings++;
    window.previewSamples.push({frequency:crossings/((last-first)/rate)});
    return start.call(this,when,offset,duration);
   };
  });
  await page.getByTitle('Reproduzir prévia',{exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('.smooth-preview').dataset.originalTime)>4.4);await page.getByTitle('Pausar prévia',{exact:true}).click();
  const samples=await page.evaluate(()=>{clearInterval(window.previewSampling);return window.previewSamples;});
  if(!samples.some(s=>Math.abs(s.frequency-440)<40)||!samples.some(s=>Math.abs(s.frequency-1320)<40))throw Error('Audio da previa nao acompanha os dois clipes');
  if(samples.some(s=>s.time>2.08&&s.time<3.92)||samples.filter(s=>Math.abs(s.frequency-880)<40).length>1)throw Error('Previa reproduziu o trecho removido: '+JSON.stringify(samples));
  await seekPreview(page,3.2);await page.getByTitle('Reproduzir prévia',{exact:true}).click();await page.waitForFunction(()=>{const v=document.querySelector('.smooth-preview'),bar=document.querySelector('.player-position');return v.dataset.playing==='false'&&Math.abs(Number(bar.value)-3.5)<.05;});
  await page.getByTitle('Reproduzir prévia',{exact:true}).click();await page.waitForFunction(()=>{const v=document.querySelector('.smooth-preview');return v.dataset.playing==='true'&&Number(v.dataset.originalTime)<1;});await page.getByTitle('Pausar prévia',{exact:true}).click();
  await page.locator('[data-cut-id="tail"]').getByTitle('Restaurar este corte').click();await ready(page,4);
  await seekPreview(page,3.6);await page.getByTitle('Reproduzir prévia',{exact:true}).click();await seekPreview(page,4);
  await page.waitForFunction(()=>{const v=document.querySelector('.smooth-preview');return v.dataset.playing==='false'&&Number(document.querySelector('.player-position').value)===4;});
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});const download=page.waitForEvent('download');await page.getByRole('link',{name:'Baixar MP4 exportado'}).click();await(await download).saveAs(path.resolve('outputs/instantaneo-exportado.mp4'));
  if(jobs.includes('preview')||jobs.filter(k=>k==='export').length!==1)throw Error('Renderizacao fora da exportacao');
  await page.screenshot({path:'outputs/previa-instantanea-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:900});await page.screenshot({path:'outputs/previa-instantanea-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)||errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||'Erro na interface');
  console.log(`OK: borda recuperada em ${elapsed} ms, zero codificacoes de previa, fonte reutilizada em dez ajustes, scrub editado, cortes com som e imagem, parada no fim removido, replay e exportacao real.`);
 }catch(e){console.error(await page.locator('body').innerText());await page.screenshot({path:'outputs/instantaneo-falha.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
