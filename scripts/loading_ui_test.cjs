const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Controlled upload events test states without uploading/copying any user video.
  await page.addInitScript(()=>{
   window.XMLHttpRequest=class{
    upload={};timers=[];responseText='';status=200;
    open(){}setRequestHeader(){}
    send(){window.testUpload=this;this.timers.push(setTimeout(()=>this.upload.onprogress?.({lengthComputable:true,loaded:450000,total:1000000}),100),setTimeout(()=>this.upload.onload?.(),4000));}
    abort(){this.timers.forEach(clearTimeout);this.onabort?.();}
   };
  });
  await page.goto(process.env.FALA_UI_URL);
  await page.getByText('Processamento local',{exact:true}).waitFor();
  const selected={name:'Meu vídeo com um nome muito longo para verificar o carregamento.mp4',mimeType:'video/mp4',buffer:Buffer.from('tiny ui fixture')};
  await page.locator('input[type=file]').first().setInputFiles(selected);
  await page.getByRole('progressbar',{name:'Importando vídeo'}).getAttribute('aria-valuenow');
  await page.waitForFunction(()=>document.querySelector('.import-loading [role=progressbar]')?.getAttribute('aria-valuenow')==='45');
  await page.screenshot({path:'outputs/loading-desktop.png',fullPage:true});
  const animated=await page.locator('.loading-signal i').first().evaluate(el=>getComputedStyle(el).animationName);
  if(animated==='none')throw Error('Loader is not animated');
  await page.setViewportSize({width:390,height:900});
  await page.screenshot({path:'outputs/loading-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
  await page.emulateMedia({reducedMotion:'reduce'});
  if(await page.locator('.loading-signal i').first().evaluate(el=>getComputedStyle(el).animationName)!=='none')throw Error('Reduced motion ignored');
  await page.getByRole('button',{name:'Cancelar importação',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.import-loading'));
  await page.getByRole('button',{name:'Fechar aviso',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.locator('input[type=file]').first().setInputFiles(selected);
  await page.waitForFunction(()=>document.querySelector('.import-loading [role=progressbar]')?.getAttribute('aria-valuenow')==='45');
  await page.waitForFunction(()=>document.querySelector('.import-loading .loading-phases .current')?.textContent.includes('Verificação'));
  await page.waitForFunction(()=>document.querySelector('.import-loading .loading-track')?.classList.contains('loading-indeterminate'));
  if(await page.getByRole('progressbar',{name:'Importando vídeo'}).getAttribute('aria-valuenow')!==null)throw Error('Invented verification percentage');
  await page.screenshot({path:'outputs/loading-verification.png',fullPage:true});
  const apiPort=new URL(process.env.FALA_UI_URL).searchParams.get('porta');
  const response=await page.request.post(`http://127.0.0.1:${apiPort}/videos`,{headers:{Authorization:'Bearer development-local'},data:{path:path.resolve('outputs/teste-original.mp4')}});
  const video=await response.json();
  await page.evaluate(result=>{const xhr=window.testUpload;xhr.timers.forEach(clearTimeout);xhr.responseText=JSON.stringify(result);xhr.onload();},video);
  await page.waitForFunction(()=>!document.querySelector('.job')&&[...document.querySelectorAll('.filmstrip img')].some(img=>img.complete&&img.naturalWidth>0),null,{timeout:60000});
  if(await page.getByRole('alert').count()||errors.length)throw Error(errors.join('\n')||'Import failed');
  console.log('OK: branded animated loading, 45% actual event, indeterminate verification, cancel, completion, thumbnails, desktop/mobile, reduced motion. No user videos uploaded.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
