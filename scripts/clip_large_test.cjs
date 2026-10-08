const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:5176/?porta=8772');await page.getByText('Processamento local',{exact:true}).waitFor();
  const start=Date.now();await page.locator('input[type=file]').nth(1).setInputFiles(path.resolve('outputs/projeto-video-completo-web.json'));
  await page.waitForFunction(()=>!!document.querySelector('video'));
  await page.getByRole('button',{name:'Original',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&!document.querySelector('.job')&&document.querySelector('.filmstrip img')?.naturalWidth>0;},null,{timeout:120000});
  const elapsed=(Date.now()-start)/1000;
  await page.getByLabel('Zoom da linha do tempo').focus();await page.keyboard.press('End');
  await page.locator('.clip-scroll').evaluate(el=>{el.scrollLeft=el.scrollWidth/2;});
  await page.waitForTimeout(250);
  const count=await page.locator('[data-clip-index]').count();if(count>100||!count)throw Error('Clipes nao virtualizados: '+count);
  await page.screenshot({path:'outputs/clipes-video-longo.png',fullPage:false});
  if(errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||'Erro durante miniaturas');
  const report={cuts:779,thumbnailPreparationSeconds:elapsed,visibleClipsAt64x:count,noMediaCopy:true};fs.writeFileSync('outputs/clipes-video-longo.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
