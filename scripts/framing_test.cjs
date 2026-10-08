const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {ready}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1536,height:1024}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(process.env.FALA_UI_URL);await page.getByText('Processamento local',{exact:true}).waitFor();
  const logo=page.getByRole('img',{name:'VoxCorte',exact:true});
  await logo.evaluate(img=>img.decode());
  const transparent=await logo.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);return x.getImageData(0,0,1,1).data[3]===0;});
  if(!transparent)throw Error('Logo nao tem fundo transparente.');
  for(const [name,file,ratio,duration] of [['horizontal','movimento-teste.mp4',16/9,8],['vertical','enquadramento-vertical.mp4',9/16,2],['quatro-tres','enquadramento-quatro-tres.mp4',4/3,2]]){
   const project=path.resolve('outputs/framing-'+name+'.json');fs.writeFileSync(project,JSON.stringify({version:1,videoPath:path.resolve('outputs',file),edit:{words:[],cuts:[]}}));
   const previous=await page.evaluate(()=>document.querySelector('video')?.getAttribute('src')??null);
   await page.locator('input[type=file]').nth(1).setInputFiles(project);
   await page.waitForFunction(src=>document.querySelector('video')?.getAttribute('src')!==src,previous);await ready(page,duration);
   for(const width of [1536,1100,390]){
    await page.setViewportSize({width,height:1024});await page.waitForTimeout(150);
    const stage=await page.locator('.video-stage').boundingBox(),canvas=await page.locator('.smooth-preview').boundingBox(),controls=await page.locator('.player-controls').boundingBox(),player=await page.locator('.player').boundingBox();
    if(Math.abs(stage.width/stage.height-ratio)>.01||Math.abs(canvas.width/canvas.height-ratio)>.01)throw Error('Proporcao incorreta: '+name+' '+width);
    if(ratio>1&&Math.abs(stage.width-(player.width-2))>3)throw Error('Video horizontal nao ocupa a largura: '+width);
    if(controls.y<stage.y+stage.height-1||await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Controles sobre a imagem ou overflow.');
    if(controls.y+controls.height>player.y+player.height+1)throw Error('Controles fora do player: '+JSON.stringify({name,width,stage,controls,player}));
    const pixels=await page.locator('.smooth-preview').evaluate(c=>{const x=c.getContext('2d');return [x.getImageData(2,2,1,1).data,x.getImageData(c.width-3,2,1,1).data].map(p=>p[0]+p[1]+p[2]);});
    if(pixels.some(sum=>sum<20))throw Error('Quadro vazio ou bordas cortadas.');
    await page.screenshot({path:`outputs/framing-${name}-${width}.png`,fullPage:true});
   }
   await page.setViewportSize({width:1536,height:1024});
  }
  await page.getByTitle('Tela cheia',{exact:true}).click();
  await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('player'));
  if(!await page.locator('.player-controls').isVisible())throw Error('Tela cheia perdeu os controles.');
  await page.evaluate(()=>document.exitFullscreen());
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Enquadramento OK: 16:9, 9:16 e 4:3, proporcao e pixels das bordas preservados, largura em paisagem, desktop/mobile, controles separados, tela cheia e logo transparente.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
