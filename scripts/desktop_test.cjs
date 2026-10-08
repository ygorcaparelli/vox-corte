const { _electron: electron } = require('playwright');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  const data=path.resolve('.local/desktop-test');fs.mkdirSync(data,{recursive:true});
  const application=await electron.launch({executablePath:process.env.FALA_TEST_EXE||require('electron'),args:process.env.FALA_TEST_EXE?[]:['.'],env:{...process.env,FALA_USER_DATA:data},timeout:60000});
  try{
    const page=await application.firstWindow();
    await page.getByText('Processamento local',{exact:true}).waitFor({timeout:60000});
    const health=await page.evaluate(async()=>{const c=await window.desktop.config();return fetch(c.url+'/health',{headers:{Authorization:'Bearer '+c.token}}).then(r=>r.json());});
    if(!health.ffmpeg||!health.whisper)throw Error(JSON.stringify(health));
    const v=await page.evaluate(async file=>{const c=await window.desktop.config();return fetch(c.url+'/videos',{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({path:file})}).then(r=>r.json());},path.resolve('outputs/teste-original.mp4'));
    if(v.duration!==6)throw Error('Importação nativa falhou');
    await page.screenshot({path:'outputs/desktop-nativo.png'});
    console.log('Electron OK: janela, preload, serviço local autenticado, Python/FFmpeg e importação nativa.',JSON.stringify(health));
  }finally{await application.close();}
})().catch(e=>{console.error(e);process.exit(1);});
