const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const destination=path.resolve(process.env.FALA_DATA,'Pasta escolhida','vídeo final.mp4');
  let picks=0,exports=0;
  page.on('request',r=>{if(r.url().endsWith('/jobs')&&r.method()==='POST'&&r.postDataJSON()?.kind==='export')exports++;});
  await page.route('**/export-location',async route=>{picks++;await route.fulfill({json:{path:picks===1?null:destination}});});
  await page.goto(process.env.FALA_UI_URL);
  await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles({name:'destination-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[],cuts:[{id:'cut',start:2,end:4}]}}))});
  await page.waitForFunction(()=>document.querySelector('video')&&!document.querySelector('.job'),null,{timeout:60000});
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('button[title="Escolher onde salvar o MP4"]')?.disabled);
  if(exports)throw Error('Cancel started an export');
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
  await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
  if(!fs.existsSync(destination)||exports!==1||picks!==2)throw Error('Destination not respected');
  await page.screenshot({path:'outputs/export-destination.png',fullPage:true});
  if(await page.getByRole('alert').count())throw Error('UI error');
  console.log('OK: canceled picker does not export; chosen folder/Unicode name used by real MP4 export with cuts.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
