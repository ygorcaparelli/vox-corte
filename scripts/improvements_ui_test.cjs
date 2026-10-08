const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const source=path.resolve('outputs/movimento-teste.mp4');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash();
 const output=path.resolve(process.env.FALA_DATA,'improvements.mp4');
 try{
  await page.route('**/export-location',r=>r.fulfill({json:{path:output}}));
  let exportId='',estimateShown=false;
  await page.route('**/jobs',async route=>{
   const response=await route.fetch();const data=await response.json();
   if(route.request().postDataJSON()?.kind==='export')exportId=data.id;
   await route.fulfill({response,json:data});
  });
  await page.route('**/jobs/*',async route=>{
   if(route.request().method()==='GET'&&exportId&&route.request().url().endsWith('/'+exportId)&&!estimateShown){
    estimateShown=true;await route.fulfill({json:{state:'running',progress:.25,message:'Codificando áudio e vídeo',speed:'0.75x',duration:3}});
   }else await route.continue();
  });
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts:[{id:'middle',start:2,end:4,label:'Pausa'}]}}))});
  await ready(page,6);
  if(!await page.getByLabel('Proteger início e fim das falas').isChecked())throw Error('Speech protection not default');
  await page.getByLabel('Frequência do zoom automático').selectOption('discreet');
  await page.getByLabel('Intensidade do zoom automático').fill('25');
  await page.getByRole('button',{name:'Zoom automático',exact:true}).click();
  if(await page.locator('[data-zoom-id]').count()!==1)throw Error('Auto zoom not generated');
  await page.locator('.clip-editor').scrollIntoViewIfNeeded();
  await page.getByTitle('Ajustar à janela',{exact:true}).click();
  await page.getByTitle('Selecionar intervalo',{exact:true}).click();
  const view=await page.locator('.clip-scroll').boundingBox(),scale=Number(await page.locator('.clip-canvas').getAttribute('data-scale'));
  await page.mouse.move(view.x+.5*scale,view.y+95);await page.mouse.down();await page.mouse.move(view.x+1.5*scale,view.y+95,{steps:10});await page.mouse.up();
  await page.locator('.timeline-range').waitFor();
  await page.getByRole('button',{name:'Não aplicar zoom na seleção',exact:true}).click();
  if(await page.locator('[data-zoom-id]').count())throw Error('Excluded region still has auto zoom');
  await page.getByRole('button',{name:'Zoom automático',exact:true}).click();
  if(await page.locator('[data-zoom-id]').count())throw Error('Auto zoom ignored excluded region');
  await page.locator('.clip-canvas').focus();await page.keyboard.press('Delete');await ready(page,5);
  await page.getByTitle('Desfazer',{exact:true}).click();await ready(page,6);
  await page.getByTitle('Refazer',{exact:true}).click();await ready(page,5);
  await page.getByRole('button',{name:'Cortes',exact:true}).first().click();
  await page.getByTitle('Ouvir original com contexto').first().click();
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>=1.2&&a.currentTime<2;});
  await page.getByTitle('Ouvir corte aplicado').first().click();
  await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>=4&&a.currentTime<4.8;});
  await page.getByText('Salvo automaticamente',{exact:true}).waitFor();
  await page.evaluate(()=>localStorage.clear());
  await page.reload();await page.getByRole('button',{name:'Recuperar projeto',exact:true}).waitFor();
  await page.getByRole('button',{name:'Recuperar projeto',exact:true}).click();await ready(page,5);
  if(await page.getByLabel('Frequência do zoom automático').inputValue()!=='discreet'||await page.getByLabel('Intensidade do zoom automático').inputValue()!=='25'||await page.locator('.zoom-exclusion').count()!==1)throw Error('Recovery lost zoom settings');
  await seekPreview(page,.1);await page.getByTitle('Reproduzir prévia',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.smooth-preview').dataset.playing==='true');
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
  await page.getByText(/Menos de 1 minuto restante/).waitFor();
  if(await page.locator('.smooth-preview').getAttribute('data-playing')!=='false'||!await page.getByLabel('Posição na prévia',{exact:true}).isDisabled())throw Error('Preview competes with export');
  await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
  if(!fs.existsSync(output)||!estimateShown||hash()!==before)throw Error('Export missing or original changed');
  await page.screenshot({path:'outputs/improvements-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'outputs/improvements-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  if(errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||await page.getByRole('alert').innerText());
  console.log('OK: interval selection/delete/undo, zoom frequency/intensity/exclusion, before/after audition, server recovery after local cache cleared, automatic export pause, ETA, real MP4, desktop/mobile and original intact.');
 }catch(error){await page.screenshot({path:'outputs/improvements-failure.png',fullPage:true});console.error(await page.locator('body').innerText());throw error;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
