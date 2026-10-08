const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],jobs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/jobs'))jobs.push(r.postDataJSON().kind);});
 const source=path.resolve('outputs/movimento-teste.mp4'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash();
 const project=path.resolve('outputs/projeto-zoom-teste.json');fs.writeFileSync(project,JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts:[{id:'c',start:2,end:3,label:'Pausa'}]}}));
 async function slider(name,value){await page.getByLabel(name,{exact:true}).evaluate((bar,t)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(bar,String(t));bar.dispatchEvent(new Event('input',{bubbles:true}));bar.dispatchEvent(new Event('change',{bubbles:true}));},value);}
 async function zoom(value){await page.waitForFunction(z=>Math.abs(Number(document.querySelector('.smooth-preview').dataset.zoom)-z)<.02,value);}
 try{
  await page.route('**/export-location',route=>route.fulfill({json:{path:path.resolve(process.env.FALA_DATA,'zoom-ui-export.mp4')}}));
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();await page.locator('input[type=file]').nth(1).setInputFiles(project);await ready(page,7);
  await page.getByRole('button',{name:'Zoom manual',exact:true}).click();
  await page.getByLabel('Início do zoom',{exact:true}).fill('4');await page.getByLabel('Fim do zoom',{exact:true}).fill('6');
  await page.getByLabel('Curva do zoom').selectOption('linear');await slider('Escala final',2);
  await seekPreview(page,5);await zoom(1.5);
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();await page.getByRole('alert').filter({hasText:'Aplique ou cancele'}).waitFor();
  if(jobs.includes('export'))throw Error('Exportação ignorou ajuste de zoom não aplicado');
  await page.getByRole('alert').getByRole('button').click();
  await page.getByRole('button',{name:'Aplicar zoom',exact:true}).click();await zoom(1.5);
  if(await page.locator('[data-zoom-id]').count()!==1)throw Error('Zoom manual não aplicado');
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await zoom(1);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();await zoom(1.5);
  await page.getByRole('button',{name:'Zoom automático',exact:true}).click();
  if(await page.locator('[data-zoom-id]').count()!==2)throw Error('Automático não preservou o zoom manual');
  await page.getByRole('button',{name:'Zoom automático',exact:true}).click();if(await page.locator('[data-zoom-id]').count()!==2)throw Error('Automático acumulou efeitos');
  await seekPreview(page,1);await zoom(1);await seekPreview(page,5);await zoom(1.5);await seekPreview(page,6.5);await zoom(1);
  const saved=page.waitForEvent('download');await page.getByTitle('Salvar projeto',{exact:true}).click();const savedPath=path.resolve('outputs/zoom-salvo.falacorte.json');await(await saved).saveAs(savedPath);
  const data=JSON.parse(fs.readFileSync(savedPath));if(data.edit.zooms.length!==2||!data.edit.zooms.some(z=>z.start===5&&z.end===7&&z.to===2))throw Error('Tempos do zoom não persistidos na fonte');
  await seekPreview(page,.2);await page.getByTitle('Reproduzir prévia',{exact:true}).click();
  const samples=await page.evaluate(()=>new Promise(resolve=>{
   const frames=[];const start=performance.now();
   function tick(){const c=document.querySelector('.smooth-preview');
    if(c.dataset.playing==='true')frames.push({time:Number(c.dataset.presentedTime),zoom:Number(c.dataset.zoom)});
    if(performance.now()-start>2600)resolve(frames);else requestAnimationFrame(tick);
   }tick();
  }));
  await page.getByTitle('Pausar prévia',{exact:true}).click();
  const ease=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
  const sourceToEdited=t=>t<=2?t:t<3?2:t-1;
  const automatic=data.edit.zooms.find(z=>z.automatic);
  const a=sourceToEdited(automatic.start),b=sourceToEdited(automatic.end);
  if(samples.filter(s=>s.time>.4&&s.time<1.8).length<15)throw Error('Zoom playback did not advance');
  for(const s of samples.filter(s=>s.time<2)){
   const expected=s.time>=a&&s.time<b?automatic.from+(automatic.to-automatic.from)*ease((s.time-a)/(b-a)):1;
   if(Math.abs(s.zoom-expected)>1e-6)throw Error('Zoom is not synchronized with displayed frame: '+JSON.stringify(s));
  }
  await seekPreview(page,5);await zoom(1.5);
  await page.locator('[data-zoom-id]').last().getByTitle('Remover este zoom').click();await seekPreview(page,5);await zoom(1);
  const oldSource=await page.locator('video').getAttribute('src');
  await page.locator('input[type=file]').nth(1).setInputFiles(savedPath);await page.waitForFunction(src=>document.querySelector('video').getAttribute('src')!==src,oldSource);await ready(page,7);await seekPreview(page,5);await zoom(1.5);
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});const download=page.waitForEvent('download');await page.getByRole('link',{name:'Baixar MP4 exportado'}).click();await(await download).saveAs(path.resolve('outputs/zoom-exportado.mp4'));
  await page.locator('[data-zoom-id]').last().locator('button').first().click();await page.screenshot({path:'outputs/zoom-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:900});await page.screenshot({path:'outputs/zoom-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)||errors.length||hash()!==before||jobs.includes('preview'))throw Error(errors.join('\n')||'Regressão de layout ou original alterado');
  console.log('OK: zoom manual ao vivo, automático sem duplicação, preservação de manual, intervalos editados, desfazer/refazer, remoção, salvar/reabrir, MP4 real, desktop/mobile e original preservado.');
 }catch(e){console.error(await page.locator('body').innerText());await page.screenshot({path:'outputs/zoom-falha.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
