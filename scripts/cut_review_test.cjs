const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let interruptions=0;
  await page.route('**/jobs/*',async route=>{
    if(route.request().method()==='GET'&&interruptions<3){interruptions++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Progresso ocupado'})});}
    else await route.continue();
  });
 const {ready:waitPreview,seekPreview}=require('./preview_test_helpers.cjs');
 const ready=duration=>waitPreview(page,duration);
  const joinedAt=async t=>{await page.waitForFunction(t=>{const c=document.querySelector('.smooth-preview');return c?.dataset.seeking==='false'&&Math.abs(Number(document.querySelector('.player-position').value)-t)<.08;},t);};
  const hearing=()=>page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>=2&&a.currentTime<3;});
  const heard=()=>page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&a.paused&&a.currentTime>=4&&a.currentTime<4.25;},null,{timeout:10000});
  try{
    await page.goto(process.env.FALA_UI_URL||'http://127.0.0.1:5175/?porta=8770');
    await page.getByText('Processamento local',{exact:true}).waitFor();
    await page.locator('input[type=file]').first().setInputFiles(path.resolve('outputs/teste-original.mp4'));
    await ready(6);
    if(interruptions!==3||await page.getByRole('alert').count())throw Error('Falha temporaria interrompeu importacao');
    await page.getByLabel('Início do intervalo',{exact:true}).fill('2');
    await page.getByLabel('Fim do intervalo',{exact:true}).fill('4');
    await page.getByRole('button',{name:'Excluir intervalo',exact:true}).click();
    await ready(4);
    const editedSrc=await page.locator('video').getAttribute('src');
    await page.locator('[data-cut-id]').first().getByTitle('Ouvir trecho removido').click();
    await hearing();await heard();
    if(await page.locator('video').getAttribute('src')!==editedSrc)throw Error('Audicao trocou a visualizacao');
    const row=page.locator('[data-cut-id]').first();
    await row.getByTitle('Localizar corte no original').click();
    await joinedAt(2);
    if(await page.locator('.interval-highlight').count()!==1||!(await row.getAttribute('class')).includes('focused-cut'))throw Error('Corte nao destacou linha do tempo');
    await page.evaluate(()=>document.querySelector('audio').muted=true);
    await row.getByTitle('Ouvir trecho removido').click();
    await heard();await ready(4);
    await row.getByTitle('Ouvir trecho removido').click();
    await hearing();await heard();await ready(4);
    await page.locator('button.cut-mark').first().click();await joinedAt(2);
    interruptions=0;
    await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
    await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
    const downloadEvent=page.waitForEvent('download');
    await page.getByRole('link',{name:'Baixar MP4 exportado'}).click();
    const download=await downloadEvent;await download.saveAs(path.resolve('outputs/corte-browser-exportado.mp4'));
    if(await download.failure())throw Error('Download falhou');
    if(await page.getByRole('alert').count()||errors.length)throw Error(errors.join('\n')||'Aviso de erro inesperado');
    await page.screenshot({path:'outputs/revisao-cortes-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:900});
    await page.screenshot({path:'outputs/revisao-cortes-mobile.png',fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Layout transborda');
    console.log('OK: importacao e exportacao com falhas 503 temporarias, previa unica real 4 s, localizar corte na fonte, audicao separada e parada no fim, download MP4, desktop/mobile.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
