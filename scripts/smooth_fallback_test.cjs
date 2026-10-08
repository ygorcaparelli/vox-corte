const {chromium}=require('playwright');
const path=require('node:path');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.VideoDecoder=undefined;});
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles(path.resolve('outputs/projeto-instantaneo.json'));
  await page.getByText(/Prévia compatível ativa/).waitFor();await ready(page,3.5);
  if(await page.locator('.smooth-preview').count())throw Error('Canvas incompatível permaneceu ativo');
  await seekPreview(page,2.2);
  if(Math.abs(await page.locator('video').evaluate(v=>v.currentTime)-4.2)>.1)throw Error('Fallback não respeitou os cortes');
  await page.getByTitle('Reproduzir prévia',{exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('video').paused);
  await page.getByTitle('Pausar prévia',{exact:true}).click();
  if(errors.length)throw Error(errors.join('\n'));
  console.log('OK: decodificador indisponível ativa fallback visível, seek editado e reprodução.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
