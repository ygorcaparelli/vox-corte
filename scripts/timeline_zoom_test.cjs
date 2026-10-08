const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Use a tiny real video with simulated long metadata; never upload user media.
    await page.route('**/videos',async route=>{
      const response=await route.fetch();const data=await response.json();
      await route.fulfill({response,json:{...data,duration:3600,fps:60}});
    });
    await page.goto(process.env.FALA_UI_URL);
    await page.getByText('Processamento local',{exact:true}).waitFor();
    const project={version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[],cuts:[]}};
    await page.locator('input[type=file]').nth(1).setInputFiles({name:'isolated-zoom.falacorte.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
    await page.waitForFunction(()=>Number(document.querySelector('.clip-canvas')?.dataset.scale)===48);
    await page.waitForFunction(()=>!document.querySelector('.job')&&[...document.querySelectorAll('.filmstrip img')].some(img=>img.complete&&img.naturalWidth>0),null,{timeout:60000});
    await page.screenshot({path:'outputs/timeline-zoom-initial.png',fullPage:true});
    await page.getByRole('button',{name:'Aumentar zoom',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('button[title="Aumentar zoom"]')?.disabled);
    const before=Number(await page.locator('.clip-canvas').getAttribute('data-scale'));
    await page.getByRole('button',{name:'Aumentar zoom',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('.clip-canvas').dataset.scale)===96);
    // Inspect a scrolled region without changing the playhead, then zoom around it.
    const anchor=await page.locator('.clip-scroll').evaluate(el=>{el.scrollLeft=5000;return (el.scrollLeft+el.clientWidth/2)/96;});
    await page.getByRole('button',{name:'Aumentar zoom',exact:true}).click();
    await page.waitForFunction(()=>Number(document.querySelector('.clip-canvas').dataset.scale)===192);
    const after=await page.locator('.clip-scroll').evaluate(el=>(el.scrollLeft+el.clientWidth/2)/192);
    if(Math.abs(anchor-after)>.1)throw Error('Zoom moved inspected region');
    await page.getByLabel('Zoom da linha do tempo').evaluate(el=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,'100');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>Number(document.querySelector('.clip-canvas').dataset.scale)>=960);
    if(await page.locator('.filmstrip img').count()>40)throw Error('Thumbnails not virtualized');
    await page.getByRole('button',{name:'Ajustar à janela',exact:true}).click();
    await page.waitForFunction(()=>{const el=document.querySelector('.clip-scroll');return el.scrollLeft===0&&el.scrollWidth<=el.clientWidth+2;});
    await page.getByRole('button',{name:'Aumentar zoom',exact:true}).click();
    await page.screenshot({path:'outputs/timeline-zoom-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:900});
    await page.screenshot({path:'outputs/timeline-zoom-mobile.png',fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
    if(errors.length)throw Error(errors.join('\n'));
    console.log('OK: hour-long timeline starts at '+before+' px/s, frame-level maximum, zoom anchor, fit, virtualized thumbnails, desktop/mobile. No user imports created.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
