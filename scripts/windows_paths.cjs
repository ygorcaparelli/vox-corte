const fs=require('node:fs');
// Native realpath can reject junction paths in restricted Windows processes.
const native=fs.realpathSync.native;
fs.realpathSync.native=(path,options)=>{
  try{return native(path,options);}catch(error){
    if(process.platform!=='win32'||error.code!=='EPERM')throw error;
    return fs.realpathSync(path,options);
  }
};
const realpath=fs.promises.realpath;
fs.promises.realpath=async(path,options)=>{
  try{return await realpath(path,options);}catch(error){
    if(process.platform!=='win32'||error.code!=='EPERM')throw error;
    return fs.realpathSync(path,options);
  }
};
