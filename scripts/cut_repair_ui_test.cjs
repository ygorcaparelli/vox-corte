const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {ready}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const source=path.resolve('outputs/teste-original.mp4'),before=fs.readFileSync(source);
  const destination=path.resolve(process.env.FALA_DATA,'cortes-revisados.mp4');
  let detected=[{id:'safe',start:2.3,end:3.7,label:'Corte seco entre falas',automatic:true}];
  await page.route('**/jobs',async route=>{
   if(route.request().method()==='POST'&&route.request().postDataJSON()?.kind==='tighten'){
    if('protectSpeech' in route.request().postDataJSON())throw Error('Original cut mode overridden');
    await route.fulfill({json:{id:'repair-test'}});
   }else await route.continue();
  });
  await page.route('**/jobs/repair-test',r=>r.fulfill({json:{state:'done',progress:1,result:{cuts:detected}}}));
  await page.route('**/export-location',r=>r.fulfill({json:{path:destination}}));
  await page.goto(process.env.FALA_UI_URL);
  await page.waitForFunction(()=>document.querySelector('.project-actions .primary')&&!document.querySelector('.project-actions .primary').disabled);
  await page.locator('input[type=file]').setInputFiles({name:'repair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts:[{id:'manual',start:1,end:1.2,label:'Corte manual'},{id:'legacy',start:2,end:4,label:'Corte seco entre falas'}]}}))});
  await ready(page,3.8);
  await page.getByRole('button',{name:'Revisar cortes automáticos',exact:true}).click();await ready(page,4.4);
  await page.getByTitle('Desfazer',{exact:true}).click();await ready(page,3.8);
  await page.getByTitle('Refazer',{exact:true}).click();await ready(page,4.4);
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
  await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
  if(!fs.existsSync(destination))throw Error('Export missing');
  detected=[];
  await page.getByRole('button',{name:'Revisar cortes automáticos',exact:true}).click();await ready(page,5.8);
  if(!before.equals(fs.readFileSync(source)))throw Error('Original altered');
  if(errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||'UI error');
  console.log('PASS: automatic cuts replaced, previously removed audio restored, manual cut retained, undo/redo, real MP4 export; detector response stubbed for deterministic UI regression.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
