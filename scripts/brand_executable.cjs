const fs=require('node:fs'),path=require('node:path');
const resedit=require('../node_modules/.pnpm/resedit@1.7.2/node_modules/resedit');
const pe=require('../node_modules/.pnpm/resedit@1.7.2/node_modules/pe-library');
const root=path.resolve(__dirname,'..');
const file=path.join(root,'outputs/release/win-unpacked/Vox Corte.exe');
const exe=pe.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true});
const resources=pe.NtExecutableResource.from(exe);
const icon=resedit.Data.IconFile.from(fs.readFileSync(path.join(root,'assets/voxcorte-app.ico')));
const groups=resources.entries.filter(entry=>entry.type===14);
for(const group of groups)resedit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,icon.icons.map(item=>item.data));
if(!groups.length)resedit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,1,1033,icon.icons.map(item=>item.data));
for(const version of resedit.Resource.VersionInfo.fromEntries(resources.entries)){
 version.setFileVersion(1,12,2,0,1033);version.setProductVersion(1,12,2,0,1033);
 for(const language of version.getAvailableLanguages())version.setStringValues(language,{FileDescription:'Vox Corte',ProductName:'Vox Corte',OriginalFilename:'Vox Corte.exe',InternalName:'Vox Corte'});
 version.outputToResourceEntries(resources.entries);
}
resources.outputResource(exe);
fs.writeFileSync(file,Buffer.from(exe.generate()));
console.log('Vox Corte.exe: original supplied icon and product/version resources applied.');
