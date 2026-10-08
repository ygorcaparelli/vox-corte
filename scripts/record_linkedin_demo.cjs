const {_electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ready,seekPreview}=require('./preview_test_helpers.cjs');
const out=path.resolve('outputs/linkedin'),source=path.join(out,'video-de-teste.mp4');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(path.join(out,'raw'),{recursive:true});
 const userData=path.resolve('.local/tmp','linkedin-demo-'+Date.now());
 const models=path.join(userData,'data/models');fs.mkdirSync(models,{recursive:true});
 for(const [model,target] of [['base',path.join(process.env.APPDATA,'fala-corte/data/models/base')],['tiny',path.resolve('.local/models/tiny')]]){
  if(fs.existsSync(path.join(target,'ready.json')))fs.symlinkSync(target,path.join(models,model),'junction');
 }
 const originalHash=sha(source),scenes=[],checks=[],errors=[];let app,page,transcript,exportResult;
 function check(name,condition,details){assert.ok(condition,name);checks.push({name,passed:true,details});}
 async function scene(id,title,subtitle,action){
  const start=Date.now()/1000;console.log('Gravando:',title);
  await wait(1200);await action();await wait(2600);
  scenes.push({id,title,subtitle,start,end:Date.now()/1000});
 }
 try{
  app=await _electron.launch({executablePath:path.resolve('outputs/release/win-unpacked/Vox Corte.exe'),
   env:{...process.env,FALA_USER_DATA:userData},recordVideo:{dir:path.join(out,'raw'),size:{width:1600,height:900}},timeout:60000});
  page=await app.firstWindow();page.on('pageerror',e=>{errors.push(e.message);console.error('Erro da interface:',e.message);});
  console.log('Janela:',page.url());
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1600,900));
  page.on('response',async response=>{
   if(!/\/jobs\//.test(response.url())||response.request().method()!=='GET')return;
   try{const data=await response.json();if(data.state==='done'&&data.result?.words)transcript=data.result;
    if(data.state==='done'&&data.result?.encoder)exportResult=data.result;}catch{}
  });
  await page.screenshot({path:path.join(out,'inicio-gravacao.png')}).catch(e=>console.error('Captura inicial:',e.message));
  await page.waitForFunction(()=>document.querySelector('.project-actions .primary')&&!document.querySelector('.project-actions .primary').disabled,null,{timeout:60000});
  const version=await app.evaluate(({app})=>app.getVersion());check('Aplicativo Windows abre',version===require('../package.json').version,{version});
  await scene(0,'Vox Corte | edição de vídeo por texto','Gravação real do aplicativo Windows. Vídeo de teste com voz sintética.',async()=>{await page.screenshot({path:path.join(out,'01-projetos.png')});});
  await scene(1,'Projetos organizados e salvos','Novo projeto, sem substituir as edições anteriores.',async()=>{
   await page.getByRole('button',{name:'Novo projeto',exact:true}).click();
   await page.getByLabel('Nome do projeto').fill('Demonstração | LinkedIn');await wait(900);
   await page.getByRole('button',{name:'Criar projeto'}).click();await page.getByText('Processamento local',{exact:true}).waitFor();
  });
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
  await scene(2,'Importação local','Arquivo original preservado. Nenhum vídeo enviado para servidores externos.',async()=>{
   await page.getByRole('button',{name:'Importar',exact:true}).click();await ready(page);
   await page.screenshot({path:path.join(out,'02-video-importado.png')});
  });
  const originalDuration=Number(await page.locator('.player-position').getAttribute('max'));
  check('Importação e prévia carregam',originalDuration>15,{duration:originalDuration});
  await scene(3,'Transcrição com tempo por palavra','Processamento local com faster-whisper. Espera abreviada na edição do vídeo.',async()=>{
   await page.getByRole('button',{name:'Transcrever',exact:true}).click();
   await page.getByText(/Transcrição concluída/).waitFor({timeout:240000});await ready(page);
   await page.screenshot({path:path.join(out,'03-transcricao.png')});
  });
  check('Transcrição real produz palavras e timestamps',transcript?.words?.length>15&&transcript.words.every(w=>Number.isFinite(w.start)&&w.end>=w.start),{words:transcript.words.length,language:transcript.language});
  const normalize=s=>s.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/g,'');
  const words=transcript.words,match=words.findIndex(w=>normalize(w.text)==='trecho');
  assert.ok(match>=0,'A frase de teste precisa aparecer na transcrição');
  const first=Math.max(0,match-1),last=words.findIndex((w,i)=>i>=match&&normalize(w.text).startsWith('removid'));
  assert.ok(last>first,'Fim da frase removida não encontrado');
  let editedDuration;
  await scene(4,'Apagar texto corta áudio e vídeo','Selecionando a frase “Este trecho será removido”.',async()=>{
   await page.locator('[data-word-id]').nth(first).click();
   await page.locator('[data-word-id]').nth(last).click({modifiers:['Shift']});await wait(1800);
   await page.getByRole('button',{name:'Excluir trecho',exact:true}).click();await ready(page);
   editedDuration=Number(await page.locator('.player-position').getAttribute('max'));
   await seekPreview(page,0);
   await page.screenshot({path:path.join(out,'04-frase-excluida.png')});
  });
  check('Excluir frase reduz a duração do vídeo',editedDuration<originalDuration-1,{before:originalDuration,after:editedDuration,removedWords:words.slice(first,last+1).map(w=>w.text).join(' ')});
  await scene(5,'Edição não destrutiva','Desfazer restaura o trecho. Refazer aplica o corte novamente.',async()=>{
   await page.getByTitle('Desfazer',{exact:true}).click();await ready(page,originalDuration);await wait(1800);
   await page.getByTitle('Refazer',{exact:true}).click();await ready(page,editedDuration);
  });
  check('Desfazer e refazer restauram as durações',true,{originalDuration,editedDuration});
  await scene(6,'Pausas e cortes revisáveis','Análise automática real. Os cortes manuais continuam preservados.',async()=>{
   await page.getByRole('button',{name:'Excluir silêncios e respirações',exact:true}).click();
   await page.getByText(/cortes aplicados:|Nenhuma pausa/).waitFor({timeout:180000});await ready(page);
   await page.getByRole('tab',{name:/^Cortes/}).click();await wait(2200);
   await page.getByRole('tab',{name:'Transcrição da fala',exact:true}).click();
  });
  await scene(7,'Linha do tempo com clipes','Navegação e zoom da linha do tempo.',async()=>{
   await page.locator('.clip-editor').scrollIntoViewIfNeeded();
   await page.getByTitle('Ajustar à janela',{exact:true}).click();await wait(900);
   await page.getByTitle('Aumentar zoom',{exact:true}).click();await wait(1300);
   await page.getByTitle('Ajustar à janela',{exact:true}).click();
   await page.screenshot({path:path.join(out,'05-linha-do-tempo.png')});
  });
  await scene(8,'Zoom na imagem e prévia editada','A prévia usa os mesmos cortes da exportação.',async()=>{
   await page.getByRole('button',{name:'Zoom automático',exact:true}).click();
   await seekPreview(page,0);await page.getByTitle('Reproduzir vídeo',{exact:true}).last().click();
   await wait(4300);await page.getByTitle('Pausar vídeo',{exact:true}).last().click();
   await page.locator('.preview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'06-previa.png')});
  });
  const destination=path.join(out,'resultado-exportado.mp4');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},destination);
  await scene(9,'Exportação MP4 com cortes reais','Exportação executada pelo aplicativo, com FFmpeg. Espera abreviada na gravação.',async()=>{
   await page.getByRole('button',{name:'Exportar MP4',exact:true}).click();
   await page.getByText(/Exportação concluída:/).waitFor({timeout:180000});await ready(page);
   await page.screenshot({path:path.join(out,'07-exportacao.png')});
  });
  check('Exportação MP4 existe',fs.existsSync(destination)&&fs.statSync(destination).size>10000,{bytes:fs.statSync(destination).size,exportResult});
  check('Arquivo original inalterado',sha(source)===originalHash,{sha256:originalHash});
  await scene(10,'Antes e depois','A seguir: áudio original e resultado exportado, ambos com voz sintética.',async()=>{
   await page.getByTitle('Voltar aos projetos').click();
   await page.getByRole('heading',{name:'Demonstração | LinkedIn',exact:true}).waitFor();
   await page.screenshot({path:path.join(out,'08-projeto-salvo.png')});
  });
  check('Projeto aparece na biblioteca após salvar',true);
  check('Interface sem erros de execução',errors.length===0,{errors});
  const video=page.video(),endStamp=Date.now()/1000;
  await app.close();app=null;
  const raw=await video.path();
  fs.writeFileSync(path.join(out,'gravacao.json'),JSON.stringify({version,raw,endStamp,scenes,checks,source,destination,userData,originalDuration,transcript},null,2));
  console.log('Gravação real concluída:',raw,'|',checks.length,'verificações');
 }catch(error){
  if(page){console.error('Pagina:',page.url());console.error((await page.locator('body').innerText().catch(()=>'' )).slice(0,1500));await page.screenshot({path:path.join(out,'falha-gravacao.png')}).catch(e=>console.error('Captura da falha:',e.message));}
  throw error;
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
