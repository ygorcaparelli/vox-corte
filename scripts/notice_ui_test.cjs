const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/jobs',async route=>{
   if(route.request().postDataJSON()?.kind==='tighten')await route.fulfill({json:{id:'notice-test'}});
   else await route.continue();
  });
  await page.route('**/jobs/notice-test',route=>route.fulfill({json:{state:'done',progress:1,result:{cuts:[{id:'test-cut',start:2,end:4}]}}}));
  await page.goto(process.env.FALA_UI_URL);
  await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles({name:'notice-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[],cuts:[]}}))});
  await page.waitForFunction(()=>!document.querySelector('.job')&&document.querySelector('video'),null,{timeout:60000});
  await page.getByRole('button',{name:'Excluir silêncios e respirações',exact:true}).click();
  const notice=page.locator('.notice-result');await notice.waitFor();
  if(!await notice.innerText().then(t=>t.includes('1 cortes aplicados')))throw Error('Result message missing');
  if(await notice.evaluate(el=>getComputedStyle(el).backgroundColor)!=='rgb(28, 25, 24)')throw Error('Old green notification remains');
  await page.screenshot({path:'outputs/notice-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'outputs/notice-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.getByRole('button',{name:'Fechar mensagem',exact:true}).click();await notice.waitFor({state:'detached'});
  console.log('OK: actual cut confirmation, coral/dark notification, dismiss and mobile wrapping. No videos uploaded.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
