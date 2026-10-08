const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],jobs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/jobs'))jobs.push(r.postDataJSON().kind);});
 await page.addInitScript(()=>{
  window.audioSchedule=[];
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when,offset,duration){window.audioSchedule.push({when,offset,duration,now:this.context.currentTime});return start.call(this,when,offset,duration);};
 });
 const source=path.resolve('outputs/movimento-teste.mp4'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before=hash();
 const kept=[[0,1],[2,2.3],[3,3.12],[4,4.5],[5,5.08],[6,7],[7.5,8]],cuts=[];
 for(let i=1;i<kept.length;i++)cuts.push({id:'c'+i,start:kept[i-1][1],end:kept[i][0],label:'Pausa '+i});
 const duration=kept.reduce((sum,[s,e])=>sum+e-s,0);
 const project=path.resolve('outputs/projeto-fluido.json');fs.writeFileSync(project,JSON.stringify({version:1,videoPath:source,edit:{words:[],cuts}}));
 const ready=()=>page.waitForFunction(()=>{const c=document.querySelector('.smooth-preview');return c?.dataset.ready==='true'&&c.dataset.seeking==='false'&&!document.querySelector('.job')&&!document.querySelector('.player-position').disabled;},null,{timeout:60000});
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();await page.locator('input[type=file]').nth(1).setInputFiles(project);await ready();
  if(await page.getByText(/Prévia compatível ativa/).count())throw Error('Novo player caiu no fallback');
  await page.evaluate(()=>{
   window.audioSchedule=[];window.presentation=[];let last=-1;
   window.presentationTimer=setInterval(()=>{const c=document.querySelector('.smooth-preview'),time=Number(c.dataset.presentedTime);if(c.dataset.playing==='true'&&time!==last){const data=c.getContext('2d').getImageData(200,100,1,1).data;window.presentation.push({wall:performance.now(),time,color:[...data]});last=time;}},5);
  });
  const started=Date.now();await page.getByTitle('Reproduzir prévia',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.smooth-preview').dataset.playing==='true');
  await page.waitForFunction(d=>{const c=document.querySelector('.smooth-preview');return c.dataset.playing==='false'&&Math.abs(Number(c.dataset.editedTime)-d)<.05;},duration,{timeout:15000});
  const report=await page.evaluate(()=>{clearInterval(window.presentationTimer);return {frames:window.presentation,audio:window.audioSchedule};});
  if(report.frames.length<duration*20)throw Error('Poucos quadros na reproducao: '+report.frames.length);
  let maxGap=0;for(let i=1;i<report.frames.length;i++)maxGap=Math.max(maxGap,report.frames[i].wall-report.frames[i-1].wall);
  const audio=report.audio.filter(a=>a.duration>0).sort((a,b)=>a.when-b.when);let maxAudioGap=0;
  for(let i=1;i<audio.length;i++)maxAudioGap=Math.max(maxAudioGap,audio[i].when-audio[i-1].when-audio[i-1].duration);
  if(maxGap>120)throw Error('Congelamento visivel entre quadros: '+maxGap+' ms');
  if(maxAudioGap>.003)throw Error('Lacuna de audio: '+maxAudioGap+' s');
  if(Math.abs(audio.reduce((sum,a)=>sum+a.duration,0)-duration)>.015)throw Error('Audio excluiu ou repetiu amostras alem dos cortes');
  if((Date.now()-started)/1000>duration+1.2)throw Error('Reproducao demorou mais que a montagem');
  const {seekPreview}=require('./preview_test_helpers.cjs');await seekPreview(page,1.15);await ready();
  if(Math.abs(Number(await page.locator('.smooth-preview').getAttribute('data-original-time'))-2.15)>.07)throw Error('Busca editada incorreta');
  await page.getByTitle('Silenciar',{exact:true}).click();await page.getByTitle('Ativar som',{exact:true}).click();
  await page.getByRole('button',{name:'Desfazer',exact:true}).isDisabled();
  await page.getByRole('button',{name:'Aumentar zoom',exact:true}).click();if(await page.getByLabel('Zoom da linha do tempo').inputValue()!=='2')throw Error('Zoom existente regrediu');
  await page.getByRole('button',{name:'Ajustar à janela',exact:true}).click();
  await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();await page.getByText(/Exportação concluída:/).waitFor({timeout:60000});
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Baixar MP4 exportado'}).click();await(await download).saveAs(path.resolve('outputs/fluido-exportado.mp4'));
  if(jobs.includes('preview')||hash()!==before||errors.length||await page.getByRole('alert').count())throw Error(errors.join('\n')||'Original alterado ou processamento inesperado');
  await page.screenshot({path:'outputs/fluido-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:900});await page.screenshot({path:'outputs/fluido-mobile.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Layout transborda');
  fs.writeFileSync('outputs/fluidez-relatorio.json',JSON.stringify({duration,frames:report.frames.length,maxFrameGapMs:maxGap,maxAudioGapSeconds:maxAudioGap,audioDuration:audio.reduce((s,a)=>s+a.duration,0),cuts:cuts.length},null,2));
  console.log('OK: '+report.frames.length+' quadros, maior intervalo '+maxGap.toFixed(1)+' ms, audio sem lacunas ('+maxAudioGap.toFixed(6)+' s), 6 cortes incluindo clipe de 80 ms, seek, zoom e exportacao.');
 }catch(e){console.error(await page.locator('body').innerText());await page.screenshot({path:'outputs/fluido-falha.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
