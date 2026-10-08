const {spawn,spawnSync}=require('node:child_process');
const http=require('node:http'),net=require('node:net'),path=require('node:path');
const children=[];
const startupErrors=[];
function start(exe,args){const child=spawn(exe,args,{stdio:'inherit',windowsHide:true});child.on('error',error=>startupErrors.push(error));children.push(child);return child;}
function available(port){return new Promise(resolve=>{const q=http.get(`http://127.0.0.1:${port}/`,r=>{r.resume();resolve(true);});q.setTimeout(1000,()=>q.destroy());q.on('error',()=>resolve(false));});}
function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)));});}
async function choose(ports){for(const port of ports)if(await free(port))return port;throw Error('Sem porta livre para teste local');}
(async()=>{
 try{
  const apiPort=await choose(Array.from({length:30},(_,i)=>8780+i)),webPort=await choose([5176,5175,5174,5173,5177,5178,5179,5180]);
  process.env.FALA_UI_URL=`http://127.0.0.1:${webPort}/?porta=${apiPort}`;
  const packaged=process.env.FALA_TEST_PACKAGED==='1';
  const resources=path.resolve('outputs/release/win-unpacked/resources');
  const python=packaged?path.join(resources,'runtime/python.exe'):path.resolve('.venv/Scripts/python.exe');
  const backend=packaged?path.join(resources,'backend/app.py'):'backend/app.py';
  start(python,[backend,'--port',String(apiPort)]);
  start(python,['-m','http.server',String(webPort),'--bind','127.0.0.1','--directory',packaged?'dist':'dist-timeline']);
  const deadline=Date.now()+60000;
  while(!await available(apiPort)||!await available(webPort)){if(startupErrors.length)throw startupErrors[0];if(Date.now()>deadline)throw Error('Servicos locais nao iniciaram');await new Promise(r=>setTimeout(r,300));}
  const result=await new Promise((resolve,reject)=>{const child=start(process.execPath,[process.argv[2]||'scripts/left_timeline_test.cjs']);child.on('error',reject);child.on('exit',resolve);});
  process.exitCode=result||0;
 }finally{
  for(const child of children){if(child.exitCode!==null||!child.pid)continue;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});child.kill();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
