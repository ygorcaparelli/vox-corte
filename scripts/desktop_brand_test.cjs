const {_electron}=require('playwright');
const path=require('node:path');
(async()=>{
 let app;
 const executablePath=process.env.FALA_TEST_EXE||path.resolve('outputs/release/win-unpacked/Vox Corte.exe');
 const userData=process.env.FALA_TEST_USER_DATA||path.resolve('.local/tmp/voxcorte-desktop-smoke-1.12');
 try{
  app=await _electron.launch({executablePath,env:{...process.env,FALA_USER_DATA:userData},timeout:30000});
  const page=await app.firstWindow();
  await page.getByRole('button',{name:'Novo projeto',exact:true}).waitFor({timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('.project-actions .primary').disabled,null,{timeout:60000});
  await page.getByRole('button',{name:'Novo projeto',exact:true}).click();
  await page.getByLabel('Nome do projeto').fill('Teste desktop 1.12');
  await page.getByRole('button',{name:'Criar projeto'}).click();
  await page.getByText('Processamento local',{exact:true}).waitFor();
  const name=await app.evaluate(({app})=>app.getName());if(name!=='Vox Corte')throw Error('Application name incorrect: '+name);
  const version=await app.evaluate(({app})=>app.getVersion());if(version!==require('../package.json').version)throw Error('Desktop version incorrect');
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('outputs/teste-original.mp4'));
  await page.waitForFunction(()=>document.querySelector('video')&&!document.querySelector('.job'),null,{timeout:60000});
  if(await page.getByRole('alert').count())throw Error('Desktop error');
  await page.locator('input[type=file]').nth(1).setInputFiles({name:'native-recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,videoPath:path.resolve('outputs/teste-original.mp4'),edit:{words:[],cuts:[{id:'native-cut',start:2,end:4,label:'Pausa'}]}}))});
  await page.waitForFunction(()=>document.querySelector('.player-position')?.max==='4'&&!document.querySelector('.job'),null,{timeout:60000});
  await page.getByText('Salvo automaticamente',{exact:true}).waitFor();
  await page.screenshot({path:'outputs/voxcorte-desktop-native.png',fullPage:true});
  await app.close();app=await _electron.launch({executablePath,env:{...process.env,FALA_USER_DATA:userData},timeout:30000});
  const reopened=await app.firstWindow();await reopened.getByRole('heading',{name:'native-recovery.json',exact:true}).waitFor({timeout:60000});
  await reopened.locator('.project-card').filter({has:reopened.getByRole('heading',{name:'native-recovery.json',exact:true})}).first().locator('.project-open').click();
  await reopened.waitForFunction(()=>document.querySelector('.player-position')?.max==='4'&&!document.querySelector('.job'),null,{timeout:60000});
  if(await reopened.getByRole('alert').count())throw Error('Native recovery error');
  console.log('Native desktop OK: current Vox Corte version/window, bundled Python, original logo, direct import, preview, thumbnails, autosave and recovery after real Electron restart.');
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
