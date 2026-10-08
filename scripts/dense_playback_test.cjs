const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
(async()=>{
 const request=JSON.parse(fs.readFileSync('.local/jobs/05b8b2d77616405083464219b3bbe220.request.json','utf8'));
 const result=JSON.parse(fs.readFileSync('.local/jobs/05b8b2d77616405083464219b3bbe220.json','utf8')).result;
 const project=path.resolve('outputs/projeto-590-cortes.json');
 const seconds=Number(process.env.FALA_SAMPLE_SECONDS||12);
 fs.writeFileSync(project,JSON.stringify({version:1,videoPath:request.path,edit:{words:[],cuts:result.cuts}}));
 const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.audioSchedule=[];const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop,rows=new WeakMap();
  AudioBufferSourceNode.prototype.start=function(when,offset,duration){const row={when,offset,duration,now:this.context.currentTime};rows.set(this,row);window.audioSchedule.push(row);return start.call(this,when,offset,duration);};
  AudioBufferSourceNode.prototype.stop=function(when){const row=rows.get(this);if(row)row.stoppedAt=when||this.context.currentTime;return stop.call(this,when);};
 });
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  await page.locator('input[type=file]').nth(1).setInputFiles(project);await ready(page);
  if(!await page.locator('.smooth-preview').count())throw Error('Fallback inesperado');
  if(process.env.FALA_AUTOMATIC_ZOOM){await page.getByRole('button',{name:'Zoom automático',exact:true}).click();if(!await page.locator('[data-zoom-id]').count())throw Error('Nenhum zoom automático no vídeo real');}
  const reports=[];
  for(const at of [0,400]){
   await seekPreview(page,at);
   await page.evaluate(()=>{window.audioSchedule=[];window.samples=[];window.timer=setInterval(()=>{const c=document.querySelector('.smooth-preview');window.samples.push({wall:performance.now(),time:Number(c.dataset.editedTime),frame:Number(c.dataset.presentedTime),buffer:Number(c.dataset.bufferedUntil),playing:c.dataset.playing,buffering:c.dataset.buffering});},20);});
   await page.getByTitle('Reproduzir prévia',{exact:true}).click();
   await page.waitForFunction(({at,seconds})=>Number(document.querySelector('.smooth-preview').dataset.editedTime)>=at+seconds,{at,seconds},{timeout:seconds*1500+30000});
   await page.getByTitle('Pausar prévia',{exact:true}).click();
   const report=await page.evaluate(()=>{clearInterval(window.timer);return {audio:window.audioSchedule,samples:window.samples};});
   const running=report.samples.filter(s=>s.playing==='true'&&s.buffering!=='true');
   report.maxLag=Math.max(...running.map(s=>s.time-s.frame));
   const firstPlaying=report.samples.find(s=>s.playing==='true');
   report.elapsed=(report.samples.at(-1).wall-firstPlaying.wall)/1000;
   report.audioSeconds=report.audio.reduce((s,a)=>s+a.duration,0);
   report.playedAudioSeconds=report.audio.reduce((s,a)=>s+Math.min(a.duration,Math.max(0,(a.stoppedAt??a.when+a.duration)-a.when)),0);
   report.bufferHolds=report.samples.filter(s=>s.wall>firstPlaying.wall&&s.buffering==='true').length;
   reports.push(report);
   console.log(JSON.stringify({at,cuts:result.cuts.length,maxLag:report.maxLag,elapsed:report.elapsed,audioSeconds:report.audioSeconds,playedAudioSeconds:report.playedAudioSeconds,bufferHolds:report.bufferHolds}));
   if(!process.env.FALA_BASELINE&&(report.maxLag>.15||report.elapsed>seconds+1||report.bufferHolds||report.playedAudioSeconds<seconds-.05))throw Error('Reproducao densa congelou ou perdeu audio');
  }
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync('outputs/590-cortes-'+(process.env.FALA_BASELINE?'antes':'depois')+'.json',JSON.stringify(reports,null,2));
  console.log('OK: video real com 590 cortes, inicio e meio, imagem e audio monitorados.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
