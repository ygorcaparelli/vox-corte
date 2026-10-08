import {useEffect,useState} from 'react';
import {Plus,FolderOpen,Film,Pencil,Trash2,Search} from 'lucide-react';
import wordmark from './assets/voxcorte-wordmark.png';
import {Edit} from './editor';
import './projects.css';
export type Project={projectId:string;projectName:string;videoPath:string;videoName:string;updatedAt:number;edit:Edit};
type Props={api:(path:string,body?:unknown,method?:string)=>Promise<any>;ready:boolean;open:(p:Project)=>void;importFile:()=>void;recover?:()=>void};
export default function ProjectLibrary({api,ready,open,importFile,recover}:Props){
  const [projects,setProjects]=useState<Project[]>([]),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [dialog,setDialog]=useState<{kind:'create'|'rename'|'delete';project?:Project}|null>(null),[name,setName]=useState('');
  async function refresh(){try{setProjects(await api('/projects'));setError('');}catch(e){setError(String(e));}}
  useEffect(()=>{if(ready)void refresh();},[ready]);
  useEffect(()=>{
    if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null;
    const modal=document.querySelector<HTMLElement>('.project-modal form');
    modal?.querySelector<HTMLElement>('input,button')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!busy){e.preventDefault();setDialog(null);}
      if(e.key==='Tab'){
        const items=Array.from(modal?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')||[]);
        const first=items[0],last=items.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus();};
  },[dialog,busy]);
  async function submit(){
    if(!dialog||busy)return;setBusy(true);setError('');
    try{
      if(dialog.kind==='create'){const p=await api('/projects',{name});setDialog(null);open(p);}
      else if(dialog.kind==='rename'){await api('/projects/'+dialog.project!.projectId,{name},'PATCH');setDialog(null);await refresh();}
      else{await api('/projects/'+dialog.project!.projectId,undefined,'DELETE');setDialog(null);await refresh();}
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <main className="project-home"><header><img src={wordmark} alt="Vox Corte"/><span>Projetos locais</span></header><section className="project-library"><div className="project-heading"><div><h1>Seus projetos</h1><p>Continue de onde parou.</p></div><div className="project-actions"><button disabled={!ready||busy} onClick={importFile}><FolderOpen size={18}/>Abrir arquivo de projeto</button><button className="primary" disabled={!ready||busy} onClick={()=>{setName('Novo projeto');setDialog({kind:'create'});}}><Plus size={18}/>Novo projeto</button></div></div>
    <label className="project-search"><Search size={18}/><input aria-label="Buscar projetos" placeholder="Buscar projetos" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    {error&&<div role="alert">{error}<button onClick={refresh}>Tentar novamente</button></div>}
    {recover&&<button className="legacy-project" onClick={recover}><FolderOpen size={18}/>Recuperar projeto da versão anterior</button>}
    {!ready?<p role="status">Conectando ao serviço local…</p>:!projects.length?<div className="project-empty"><Film size={40}/><h2>Nenhum projeto salvo ainda</h2><p>Crie seu primeiro projeto.</p></div>:<div className="project-grid">{projects.filter(p=>(p.projectName+' '+p.videoName).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p=><article className="project-card" key={p.projectId}><button className="project-open" disabled={busy} onClick={async()=>{setBusy(true);try{open(await api('/projects/'+p.projectId));}catch(e){setError(String(e));}finally{setBusy(false);}}}><div className="project-cover"><Film size={38}/></div><h2>{p.projectName}</h2><p>{p.videoName||'Sem vídeo'}</p><small>{new Date(p.updatedAt).toLocaleString('pt-BR')}</small></button><div className="project-card-actions"><button title="Renomear projeto" onClick={()=>{setName(p.projectName);setDialog({kind:'rename',project:p});}}><Pencil size={16}/></button><button title="Excluir projeto" onClick={()=>setDialog({kind:'delete',project:p})}><Trash2 size={16}/></button></div></article>)}</div>}
    </section>{dialog&&<div className="project-modal"><form role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" onSubmit={e=>{e.preventDefault();void submit();}}><h2 id="project-dialog-title">{dialog.kind==='create'?'Novo projeto':dialog.kind==='rename'?'Renomear projeto':'Excluir projeto?'}</h2>{dialog.kind==='delete'?<p>Excluir “{dialog.project?.projectName}”? O vídeo original e os vídeos exportados não serão apagados.</p>:<label>Nome do projeto<input autoFocus maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>}<div><button type="button" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button className="primary" disabled={busy||(dialog.kind!=='delete'&&!name.trim())}>{busy?'Salvando…':dialog.kind==='delete'?'Excluir':dialog.kind==='create'?'Criar projeto':'Salvar'}</button></div>{error&&<p role="alert">{error}</p>}</form></div>}</main>;
}
