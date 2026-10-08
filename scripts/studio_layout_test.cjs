const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const words=Array.from({length:160},(_,i)=>({id:'word'+i,text:['Hoje','vamos','editar','o','vídeo','com','cortes','e','zoom','na','imagem.'][i%11],start:i*.045,end:i*.045+.04,paragraph:Math.floor(i/24)}));
 const file=path.resolve('outputs/studio-projeto.falacorte.json');
 fs.writeFileSync(file,JSON.stringify({version:1,videoPath:path.resolve('outputs/movimento-teste.mp4'),edit:{words,cuts:[]}}));
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles(file);await ready(page,8);
  const text=await page.locator('.transcription').boundingBox(),video=await page.locator('.preview').boundingBox(),tools=await page.locator('.editing-tools').boundingBox(),timeline=await page.locator('.timeline').boundingBox();
  if(!(text.x<video.x&&video.x<tools.x&&timeline.y>=video.y+video.height-2&&text.height<700))throw Error('Organizacao desktop incorreta');
  if(!await page.locator('.text-panel').evaluate(el=>el.scrollHeight>el.clientHeight))throw Error('Transcricao nao fica rolavel');
  await page.getByRole('checkbox',{name:'Manter trecho 00:00.0',exact:true}).uncheck();
  await page.waitForFunction(()=>Number(document.querySelector('.player-position').max)<7.6);
  await page.getByRole('tab',{name:/Cortes/}).click();await page.locator('.cut-row').first().waitFor({state:'visible'});
  await page.locator('.cut-row').first().getByTitle('Ouvir trecho removido').click();
  await page.locator('.cut-row').first().getByTitle('Restaurar este corte').click();await ready(page,8);
  await page.getByRole('tab',{name:'Transcrição da fala',exact:true}).click();
  const first=page.locator('[data-word-id]').first();await first.focus();await page.keyboard.press('Enter');await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Delete');
  await page.waitForFunction(()=>Number(document.querySelector('.player-position').max)<8);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();await ready(page,8);
  await page.locator('.editor-rail').getByRole('button',{name:'Zoom',exact:true}).click();
  await page.getByRole('button',{name:'Zoom automático',exact:true}).click();
  await seekPreview(page,1);await page.waitForFunction(()=>Number(document.querySelector('.smooth-preview').dataset.zoom)>1);
  await page.locator('.source-selection').evaluate(el=>el.open=false);
  await page.screenshot({path:'outputs/studio-desktop.png',fullPage:true});
  for(const width of [1100,768,390]){
   await page.setViewportSize({width,height:900});await page.waitForTimeout(200);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow em '+width);
   await page.screenshot({path:'outputs/studio-'+width+'.png',fullPage:true});
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Studio OK: organizacao, transcricao compacta/rolavel, checkbox com corte real, ouvir/restaurar, selecao por teclado, desfazer, zoom e desktop/tablet/mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
