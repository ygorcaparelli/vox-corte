const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const source=path.resolve('outputs/teste-original.mp4');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash();
 const project=path.resolve('outputs/projeto-esquerda-teste.json');
 fs.writeFileSync(project,JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts:[]}}));
 const {ready:waitPreview,seekPreview}=require('./preview_test_helpers.cjs');
 const ready=duration=>waitPreview(page,duration);
 const aligned=async()=>{await page.locator('.clip-scroll').evaluate(e=>e.scrollLeft=0);await page.waitForTimeout(100);const v=await page.locator('.clip-scroll').boundingBox(),c=await page.locator('.timeline-clip').first().boundingBox();if(v.width<page.viewportSize().width/2||Math.abs(v.x-c.x)>1)throw Error('Clipe nao comeca na esquerda');};
 async function seek(t){await page.locator('.clip-editor').scrollIntoViewIfNeeded();const scale=Number(await page.locator('.clip-canvas').getAttribute('data-scale')),v=await page.locator('.clip-scroll').boundingBox(),left=await page.locator('.clip-scroll').evaluate(e=>e.scrollLeft);await page.mouse.click(v.x+t*scale-left,v.y+18);await page.waitForFunction(t=>Math.abs(Number(document.querySelector('.clip-playhead').getAttribute('aria-valuenow'))-t)<.06,t);}
 async function color(t){await seekPreview(page,t);return page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;const x=c.getContext('2d');x.drawImage(document.querySelector('.smooth-preview')||document.querySelector('video'),0,0,8,8);return [...x.getImageData(4,4,1,1).data];});}
 try{
  await page.goto(process.env.FALA_UI_URL||'http://127.0.0.1:5176/?porta=8772');await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles(project);await ready(6);await aligned();
  if(await page.getByRole('button',{name:/^(Original|Editada|Montagem|Fonte)$/}).count())throw Error('Seletor de previa ainda visivel');
  if(await page.locator('.bars,.clip-audio').count())throw Error('Audio separado do clipe');
  await page.locator('.clip-editor').scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Aumentar zoom',exact:true}).click();
  const view=await page.locator('.clip-scroll').boundingBox();await page.mouse.move(view.x+view.width/2,view.y+155);await page.mouse.down();await page.mouse.move(view.x+view.width/2-180,view.y+155,{steps:10});await page.mouse.up();
  if(await page.locator('.clip-scroll').evaluate(e=>e.scrollLeft)<150)throw Error('Arraste antes da edicao nao funciona');
  if(Number(await page.locator('.clip-playhead').getAttribute('aria-valuenow'))>.06)throw Error('Scroll alterou reproducao');
  await aligned();await page.getByRole('button',{name:'Ajustar à janela',exact:true}).click();
  await seek(2);const head=await page.locator('.clip-playhead').boundingBox(),vp=await page.locator('.clip-scroll').boundingBox();if(Math.abs(head.x-vp.x-vp.width/3)>2)throw Error('Marcador continua centralizado');
  await page.mouse.move(head.x+1,head.y+20);await page.mouse.down();await page.mouse.move(vp.x+vp.width/2,head.y+20,{steps:10});await page.mouse.up();await page.waitForFunction(()=>Math.abs(Number(document.querySelector('.clip-playhead').getAttribute('aria-valuenow'))-3)<.06);
  await page.getByLabel('Início do intervalo',{exact:true}).fill('2');await page.getByLabel('Fim do intervalo',{exact:true}).fill('4');await page.getByRole('button',{name:'Excluir intervalo',exact:true}).click();await ready(4);await aligned();
  const red=await color(.5),blue=await color(2.5);if(red[0]<200||blue[2]<200)throw Error('Corte nao aplicado automaticamente');
  const editedSrc=await page.locator('video').getAttribute('src');await page.getByTitle('Ouvir trecho removido',{exact:true}).click();
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>=2;});
  if(await page.locator('video').getAttribute('src')!==editedSrc)throw Error('Ouvir trocou o video para original');
  await page.waitForFunction(()=>document.querySelector('audio').paused,null,{timeout:5000});
  if(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-4)>.15)throw Error('Audicao ultrapassou o corte');
  await seek(1);await page.getByRole('button',{name:'Dividir no marcador',exact:true}).click();if(await page.locator('.timeline-clip').count()!==3)throw Error('Divisao falhou');
  await page.getByRole('button',{name:'Selecionar clipe 1',exact:true}).click();await page.getByRole('button',{name:'Selecionar clipe 1',exact:true}).press('Delete');await ready(3);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready(4);await page.getByRole('button',{name:'Refazer',exact:true}).click();await ready(3);
  await seek(.5);const scale=Number(await page.locator('.clip-canvas').getAttribute('data-scale')),handle=await page.getByRole('button',{name:'Fim do clipe 1',exact:true}).boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2+scale,handle.y+20,{steps:10});await page.mouse.up();await ready(4);
  const green=await color(1.5);if(green[1]<70||green[0]>40)throw Error('Borda nao recuperou trecho');
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});const download=page.waitForEvent('download');await page.getByRole('link',{name:'Baixar MP4 exportado'}).click();await(await download).saveAs(path.resolve('outputs/central-editado-teste.mp4'));
  await page.locator('.clip-editor').scrollIntoViewIfNeeded();await aligned();await page.locator('.clip-editor').screenshot({path:'outputs/esquerda-linha-do-tempo.png'});
  await page.setViewportSize({width:390,height:900});await page.locator('.clip-editor').scrollIntoViewIfNeeded();await aligned();await page.screenshot({path:'outputs/esquerda-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Layout transborda');
  if(hash()!==before)throw Error('Original foi modificado');if(errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||'Erro na interface');
  console.log('OK: alinhamento esquerdo, arraste antes de editar, scroll independente, marcador movel, previa unica automatica, audicao isolada, dividir/Delete, desfazer/refazer, recuperar borda, exportacao, mobile e original preservado.');
 }catch(e){console.error(await page.locator('body').innerText());await page.screenshot({path:'outputs/esquerda-falha.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
