const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {ready}=require('./preview_test_helpers.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const source=path.resolve('outputs/movimento-teste.mp4'),before=fs.readFileSync(source);
 async function home(){await page.getByTitle('Voltar aos projetos').click();await page.getByRole('heading',{name:'Seus projetos'}).waitFor();}
 async function create(name){await page.getByRole('button',{name:'Novo projeto',exact:true}).click();await page.getByLabel('Nome do projeto').fill(name);await page.getByRole('button',{name:'Criar projeto'}).click();await page.getByTitle('Voltar aos projetos').waitFor();}
 try{
  await page.goto(process.env.FALA_UI_URL);
  await page.getByRole('button',{name:'Novo projeto',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.project-actions .primary').disabled);
  await create('Teste em branco');await home();
  await page.locator('.project-card').filter({hasText:'Teste em branco'}).getByTitle('Renomear projeto').click();
  await page.getByLabel('Nome do projeto').fill('Projeto renomeado');await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.getByRole('heading',{name:'Projeto renomeado'}).waitFor();
  const data={version:1,videoPath:source,videoName:'Mesmo vídeo',edit:{words:[],cuts:[{id:'cut',start:2,end:4}]}};
  await page.locator('input[type=file]').setInputFiles({name:'a.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await ready(page,6);await home();
  await page.locator('input[type=file]').setInputFiles({name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...data,projectName:'Sem cortes',edit:{words:[],cuts:[]}}))});
  await ready(page,8);await home();await page.reload();
  await page.locator('.project-card').filter({has:page.getByRole('heading',{name:'Mesmo vídeo',exact:true})}).getByRole('button').first().click();await ready(page,6);await home();
  await page.locator('.project-card').filter({hasText:'Sem cortes'}).getByRole('button').first().click();await ready(page,8);await home();
  await page.screenshot({path:'outputs/projects-desktop.png',fullPage:true});
  await page.locator('.project-card').filter({hasText:'Projeto renomeado'}).getByTitle('Excluir projeto').click();
  await page.getByRole('button',{name:'Excluir',exact:true}).click();await page.getByRole('heading',{name:'Projeto renomeado'}).waitFor({state:'hidden'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/projects-mobile.png',fullPage:true});
  if(!before.equals(fs.readFileSync(source)))throw Error('Source changed');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: blank/create/rename/import, independent edits, reload, delete, source preservation, desktop/mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
