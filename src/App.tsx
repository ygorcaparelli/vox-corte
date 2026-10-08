import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Scissors, Undo2, Redo2, Download, Mic, Search, RotateCcw, Save, FolderOpen, X, Film, Play, Wind, Text, Focus, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import wordmark from './assets/voxcorte-wordmark.png';
import { Cut, Edit, Word, Zoom, deleted, mergeCuts, selectionCuts, restoreIntervals, validRange, originalToEdited, editedToOriginal, replaceAutomaticCuts } from './editor';
import ClipTimeline, {Thumbnail} from './ClipTimeline';
import {useCutPlayback} from './useCutPlayback';
import PlayerControls from './PlayerControls';
import SmoothPreview from './SmoothPreview';
import {SmoothPlayback} from './SmoothPlayback';
import CutList from './CutList';
import ZoomPanel from './ZoomPanel';
import TaskLoading from './TaskLoading';
import {validZoom,compileZooms,zoomAt} from './zoom';
import {useRecovery} from './useRecovery';
import {exportEstimate} from './exportEstimate';
import {cutAudition} from './cutAudition';
import ProjectLibrary,{Project} from './ProjectLibrary';
type Video = { id: string; path: string; name: string; duration: number; width: number; height: number; fps: number; size: number; audio: boolean };
type Config = { url: string; token: string; error?: string };
type Job = { id: string; state: string; progress: number; message: string; kind?:string; bytes?: number; totalBytes?: number; speed?:string;duration?:number };
declare global { interface Window { desktop?: { config(): Promise<Config>; openVideo(): Promise<string | null>; saveVideo(): Promise<string | null>; filePath(file: File): string } } }
const empty: Edit = { words: [], cuts: [] };
const noSplits: number[] = [];
const noZooms: Zoom[] = [];
const clock = (n: number) => `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(1).padStart(4,'0')}`;
export default function App() {
  const [config,setConfig] = useState<Config>();
  const [health,setHealth] = useState<Record<string, boolean|string>>();
  const [video,setVideo] = useState<Video>();
  const [previewId,setPreviewId] = useState<string>(), [previewFailed,setPreviewFailed] = useState(false);
  const seekTarget=useRef(0);
  const [edit,setEdit] = useState<Edit>(empty);
  const [activeProject,setActiveProject]=useState<Project>();
  const [home,setHome]=useState(true);
  const recovery=useRecovery(config,video,edit,activeProject?.projectId);
  const [draftZooms,setDraftZooms]=useState<Zoom[]|null>(null);
  const activeZooms=draftZooms||edit.zooms||noZooms;
  const [past,setPast] = useState<Edit[]>([]), [future,setFuture] = useState<Edit[]>([]);
  const [selected,setSelected] = useState<string[]>([]);
  const [search,setSearch] = useState(''), [correction,setCorrection] = useState('');
  const [sideView,setSideView] = useState<'text'|'cuts'>('text');
  const [activeTool,setActiveTool] = useState('text');
  function openTool(tool:string) {
    setActiveTool(tool);
    if(tool==='text'||tool==='cuts')setSideView(tool);
    const target=tool==='zoom'?'.image-zoom':tool==='settings'?'.processing-settings':'.transcription';
    document.querySelector(target)?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  const [language,setLanguage] = useState('pt'), [model,setModel] = useState('base'), [device,setDevice] = useState('cpu');
  const [models,setModels] = useState<{id:string;ready:boolean;estimatedMB:number}[]>([]);
  const [job,setJob] = useState<Job>();
  const [importState,setImportState] = useState<{progress:number|null;bytes:number;total:number;message:string;filename?:string;phase:'transfer'|'verify'}|null>(null);
  const importRef=useRef(false), importCancel=useRef<(()=>void)|null>(null);
  const [message,setMessage] = useState(''), [error,setError] = useState('');
  const [exported,setExported] = useState<{id:string;path:string}>();
  const [choosingExport,setChoosingExport]=useState(false);
  const exportDialog=useRef(false);
  const [thumbnails,setThumbnails] = useState<Thumbnail[]>([]);
  const [time,setTime] = useState(0);
  const [playing,setPlaying] = useState(false);
  const smooth=useRef<SmoothPlayback|null>(null);
  const [smoothMode,setSmoothMode]=useState<'loading'|'ready'|'fallback'>('loading');
  const smoothModeRef=useRef(smoothMode);smoothModeRef.current=smoothMode;
  const [drag,setDrag] = useState(false);
  const [range,setRange] = useState<{start:number|null;end:number|null}>({start:null,end:null});
  const [candidates,setCandidates] = useState<Cut[]|null>(null), [approved,setApproved] = useState<string[]>([]);
  const [sensitivity,setSensitivity] = useState(2);
  const [focusedCut,setFocusedCut] = useState<string>();
  const timelineDrag = useRef<{x:number;time:number}|null>(null);
  const audition=useRef<HTMLAudioElement>(null), auditionRange=useRef<{start:number;end:number}|null>(null), auditionPending=useRef(false);
  const auditionQueue=useRef<{start:number;end:number}[]>([]);
  const sourceSelection = useRef<HTMLDetailsElement>(null);
  const player = useRef<HTMLVideoElement>(null), input = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false), busyRef = useRef(false), anchor = useRef(0), pointer = useRef<number|null>(null);
  const cuts = useMemo(()=>mergeCuts(edit.cuts, video?.duration || 0),[edit.cuts,video?.duration]);
  const removed = cuts.reduce((n,c)=>n+c.end-c.start,0);
  const previewReady=!!video&&removed<video.duration&&!previewFailed&&smoothMode!=='loading'&&job?.kind!=='export'&&!choosingExport;
  const mediaId=previewId||video?.id;
  const playback=useCutPlayback(player,mediaId,edit.cuts,video?.duration||0,video?.fps||30,t=>{if(smoothModeRef.current==='fallback')setTime(t);},smoothMode==='fallback');
  useEffect(()=>setSmoothMode('loading'),[mediaId]);
  useEffect(()=>{setDraftZooms(null);},[edit,mediaId]);
  useEffect(()=>{smooth.current?.setZooms(activeZooms);},[activeZooms,smoothMode]);
  const compiledZooms=useMemo(()=>compileZooms(activeZooms,edit.cuts,video?.duration||0),[activeZooms,edit.cuts,video?.duration]);
  useEffect(()=>{const v=player.current;if(v){const z=smoothMode==='fallback'?zoomAt(originalToEdited(time,edit.cuts,video?.duration||0),compiledZooms):{scale:1,x:.5,y:.5};v.style.transform=`scale(${z.scale})`;v.style.transformOrigin=`${z.x*100}% ${z.y*100}%`;}},[time,compiledZooms,smoothMode]);
  useEffect(()=>{const v=player.current;if(!v)return;const update=()=>{if(smoothModeRef.current==='fallback')setPlaying(!v.paused&&!v.ended);};v.addEventListener('play',update);v.addEventListener('pause',update);v.addEventListener('ended',update);return()=>{v.removeEventListener('play',update);v.removeEventListener('pause',update);v.removeEventListener('ended',update);};},[mediaId]);
  function pausePlayback(){player.current?.pause();smooth.current?.pause();}
  const chosenModel = models.find(m=>m.id===model);
  const rangeReady = validRange(range.start,range.end,video?.duration||0);
  function stopAudition(){audition.current?.pause();auditionRange.current=null;auditionPending.current=false;auditionQueue.current=[];}
  function startAudition(){const a=audition.current,r=auditionRange.current;if(!a||!r||!auditionPending.current)return;auditionPending.current=false;a.currentTime=r.start;a.play().catch(e=>{stopAudition();setError(`Não foi possível ouvir o trecho: ${e.message}`);});}
  function change(next: Edit) { stopAudition(); setPast(p=>[...p,edit]); setFuture([]); setEdit(next); if(next.cuts!==edit.cuts){pausePlayback();seekTarget.current=time;} }
  function undo() { if (!past.length || busyRef.current) return; stopAudition();seekTarget.current=time;pausePlayback();setFuture(f=>[edit,...f]); setEdit(past.at(-1)!); setPast(p=>p.slice(0,-1)); }
  function redo() { if (!future.length || busyRef.current) return; stopAudition();seekTarget.current=time;pausePlayback();setPast(p=>[...p,edit]); setEdit(future[0]); setFuture(f=>f.slice(1)); }
  function remove(ids: string[] = selected) { if (ids.length && !busyRef.current) { change({ ...edit, cuts: [...edit.cuts,...selectionCuts(edit.words,ids)] });setSelected(ids); pointer.current=null; } }
  function removeRange() { if(rangeReady && !busyRef.current) {change({...edit,cuts:[...edit.cuts,{id:crypto.randomUUID(),start:range.start!,end:range.end!,label:'Corte manual'}]});setRange({start:null,end:null});} }
  function timelineTime(e: React.PointerEvent<HTMLDivElement>) {const r=e.currentTarget.getBoundingClientRect();return Math.max(0,Math.min(video?.duration||0,(e.clientX-r.left)/r.width*(video?.duration||0)));}
  function inspectCut(cut:Cut) {
    pausePlayback();stopAudition();seek(cut.start);
    setFocusedCut(cut.id);setRange({start:cut.start,end:cut.end});
    if(sourceSelection.current)sourceSelection.current.open=true;
    document.querySelector('.timeline')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function listen(cut:Cut) {inspectCut(cut);auditionRange.current={start:cut.start,end:cut.end};auditionPending.current=true;if(audition.current?.readyState)startAudition();else audition.current?.load();}
  function compareCut(cut:Cut,edited:boolean){
    if(!video||busyRef.current)return;inspectCut(cut);
    const ranges=cutAudition(cut,edit.cuts,video.duration,edited);
    auditionRange.current=ranges.shift()||null;auditionQueue.current=ranges;
    if(!auditionRange.current){setMessage('Não há áudio mantido próximo deste corte.');return;}
    auditionPending.current=true;if(audition.current?.readyState)startAudition();else audition.current?.load();
  }
  useEffect(()=>{const a=audition.current;if(!a)return;let frame:number;const tick=()=>{if(auditionRange.current&&!auditionPending.current&&a.currentTime>=auditionRange.current.end){const next=auditionQueue.current.shift();if(next){a.pause();auditionRange.current=next;auditionPending.current=true;startAudition();}else stopAudition();}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);a.pause();auditionRange.current=null;auditionPending.current=false;auditionQueue.current=[];};},[video?.id,previewId]);
  function restore() { change({ ...edit,cuts:restoreIntervals(edit.cuts,selectionCuts(edit.words,selected)) }); }
  function applyCandidates(all: boolean) {
    if(busyRef.current||!candidates)return;
    const batch=all?candidates:candidates.filter(c=>approved.includes(c.id));
    if(!batch.length)return;
    change({...edit,cuts:[...edit.cuts,...batch]});
    setCandidates(null);setApproved([]);
    setMessage(`${batch.length} trechos de respiração excluídos.`);
  }
  async function api(path:string, body?:unknown, method?:string, retry=0):Promise<any> {
    if (!config) throw Error('O serviço local ainda está iniciando.');
    const r = await fetch(config.url+path,{method:method||(body?'POST':'GET'),headers:{Authorization:`Bearer ${config.token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});
    if (!r.ok) {
      if(path.startsWith('/jobs/')&&!body&&!method&&r.status>=500&&retry<20){await new Promise(resolve=>setTimeout(resolve,500));return api(path,body,method,retry+1);}
      const e = await r.json().catch(()=>({detail:`Falha no serviço local (HTTP ${r.status}).`})); throw Error(e.detail || 'Falha no serviço local');
    }
    return r.json();
  }
  useEffect(()=>{ (async()=>{ try { const requestedPort=Number(new URLSearchParams(window.location.search).get('porta')||8765);const port=Number.isInteger(requestedPort)&&requestedPort>=1024&&requestedPort<=65535?requestedPort:8765;const c = window.desktop ? await window.desktop.config() : {url:`http://127.0.0.1:${port}`,token:'development-local'}; setConfig(c); if(c.error) setError(c.error); } catch(e){setError(String(e));} })(); },[]);
  useEffect(()=>{ if(config) { api('/health').then(setHealth).catch(e=>setError(`Serviço indisponível: ${e.message}. Execute Instalar.ps1 e Iniciar.ps1.`)); api('/models').then(list=>{setModels(list);if(!list.find((m:{id:string;ready:boolean})=>m.id==='base')?.ready){const ready=list.find((m:{ready:boolean})=>m.ready);if(ready)setModel(ready.id);}}).catch(()=>{}); } },[config]);
  async function task(kind:string, payload:Record<string,unknown>={}, done?:(result:any)=>void|Promise<void>) {
    if(busyRef.current) return;
    if(kind==='export'){pausePlayback();stopAudition();}
    let completed=false;
    busyRef.current=true; cancelRef.current=false; setError(''); setMessage('');
    setJob({id:'',state:'queued',progress:0,message:'Preparando',kind});
    try {
      const {id} = await api('/jobs',{kind,...payload});
      setJob({id,state:'queued',progress:0,message:'Preparando',kind});
      while(true) {
        await new Promise(r=>setTimeout(r,450));
        const state = await api('/jobs/'+id); setJob({id,...state,kind});
        if(state.state==='done') { if(!cancelRef.current){await done?.(state.result);completed=true;} break; }
        if(state.state==='error') throw Error(state.message);
        if(state.state==='cancelled') break;
      }
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
    finally {busyRef.current=false;setJob(undefined);}
    return completed;
  }
  async function cancel() { if(job) {cancelRef.current=true;await api('/jobs/'+job.id,undefined,'DELETE');} }
  async function importVideo(file?:File, path?:string, saved?:Edit) {
    if(busyRef.current||importRef.current) return;
    importRef.current=true;
    setImportState({progress:null,bytes:0,total:file?.size||0,message:'Lendo informações do vídeo…',filename:file?.name,phase:'verify'});
    pausePlayback();stopAudition();setError('');setMessage('');
    try {
      let v:Video;
      const nativePath=path||(file&&window.desktop?.filePath(file));
      if(nativePath) v=await api('/videos',{path:nativePath});
      else if(file) {
        if(!config)throw Error('Aguarde o serviço local iniciar.');
        v=await new Promise<Video>((resolve,reject)=>{
          const xhr=new XMLHttpRequest(),data=new FormData();data.append('file',file);
          xhr.open('POST',config.url+'/upload');xhr.setRequestHeader('Authorization',`Bearer ${config.token}`);
          importCancel.current=()=>xhr.abort();
          xhr.upload.onprogress=e=>setImportState({progress:e.lengthComputable&&e.total>0?e.loaded/e.total:null,bytes:e.loaded,total:e.lengthComputable?e.total:file.size,message:'Transferindo para processamento local…',filename:file.name,phase:'transfer'});
          xhr.upload.onload=()=>setImportState({progress:null,bytes:file.size,total:file.size,message:'Verificando se este vídeo já está armazenado…',filename:file.name,phase:'verify'});
          xhr.onload=()=>{try {const result=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300)resolve(result);else reject(Error(result.detail||'Falha ao importar vídeo'));}catch(e){reject(e);}};
          xhr.onerror=()=>reject(Error('Falha na conexão durante a importação.'));
          xhr.onabort=()=>reject(Error('Importação cancelada.'));
          xhr.send(data);
        });
      }
      else { const p=await window.desktop?.openVideo();if(!p){setMessage('');return;}v=await api('/videos',{path:p}); }
      setVideo(v);setPreviewId(undefined);setPreviewFailed(false);setEdit(saved||empty);setPast([]);setFuture([]);setSelected([]);setTime(0);setMessage('');
      if(sourceSelection.current)sourceSelection.current.open=false;
      setRange({start:null,end:null});setCandidates(null);setApproved([]);stopAudition();
      setFocusedCut(undefined);setExported(undefined);setThumbnails([]);
      seekTarget.current=0;
      importRef.current=false;importCancel.current=null;setImportState(null);
      const capabilities=health||await api('/health');
      if(capabilities.thumbnails)await task('thumbnails',{videoId:v.id},r=>setThumbnails(r.frames));
    } catch(e){setError(String(e));setMessage('');}
    finally {importRef.current=false;importCancel.current=null;setImportState(null);}
  }
  function seek(t:number) {seekTarget.current=t;if(previewReady){if(smoothMode==='ready')smooth.current?.seekOriginal(t);else playback.seek(t);}}
  useEffect(()=>{if(smoothMode==='ready'){smooth.current?.setVolume(player.current?.volume??1);smooth.current?.setMuted(player.current?.muted??false);}},[smoothMode,mediaId]);
  function togglePlay(){if(!previewReady||job?.kind==='export'||choosingExport)return;stopAudition();if(smoothMode==='ready'){const engine=smooth.current;if(!engine)return;if(engine.isPlaying())engine.pause();else engine.play().catch(e=>setError(e.message));}else{const v=player.current;if(!v)return;if(v.paused)v.play().catch(e=>setError(e.message));else v.pause();}}
  function select(index:number, extend:boolean) {
    if(extend) {const a=Math.min(anchor.current,index),b=Math.max(anchor.current,index);setSelected(edit.words.slice(a,b+1).map(w=>w.id));}
    else {anchor.current=index;setSelected([edit.words[index].id]);setCorrection(edit.words[index].text);}
    seek(edit.words[index].start);
  }
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{
      const el=event.target as HTMLElement;
      if(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
      if(event.key==='Delete'){event.preventDefault();if(el.closest('.timeline')&&rangeReady)removeRange();else {const id=el.closest<HTMLElement>('[data-word-id]')?.dataset.wordId;remove(id&&!selected.includes(id)?[id]:selected);}}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}
      if(event.key==='Escape')setSelected([]);
    };window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);
  });
  useEffect(()=>{const stop=()=>{pointer.current=null;};window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);return()=>{window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);};},[]);
  function saveProject() {if(!video)return;if(draftZooms){setError('Aplique ou cancele o ajuste de zoom antes de salvar o projeto.');return;}const blob=new Blob([JSON.stringify({version:1,videoPath:video.path,videoName:video.name,edit},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=video.name+'.falacorte.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function loadProject(file:File) {try {const p=JSON.parse(await file.text());if(p.version!==1||!Array.isArray(p.edit?.words)||!Array.isArray(p.edit?.cuts)||!p.edit.words.every((w:Word)=>typeof w.id==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end))||!p.edit.cuts.every((c:Cut)=>Number.isFinite(c.start)&&Number.isFinite(c.end))||(p.edit.zooms!==undefined&&(!Array.isArray(p.edit.zooms)||p.edit.zooms.length>500||!p.edit.zooms.every(validZoom)))||(p.edit.splits!==undefined&&(!Array.isArray(p.edit.splits)||!p.edit.splits.every((t:unknown)=>typeof t==='number'&&Number.isFinite(t)&&t>=0))))throw Error('Projeto inválido');await recovery.flush();const record=await api('/projects',{name:p.projectName||p.videoName||file.name});const saved=await api('/projects/'+record.projectId,{...p,updatedAt:Date.now()},'PUT');openSavedProject(saved);}catch(e){setError(String(e));}}
  function openSavedProject(p:Project){
    setVideo(undefined);setEdit(empty);setPast([]);setFuture([]);setActiveProject(p);setHome(false);setError('');
    if(p.videoPath)void importVideo(undefined,p.videoPath,p.edit);
  }
  async function backToProjects(){
    if(busyRef.current||importRef.current||choosingExport)return;
    if(draftZooms){setError('Aplique ou cancele o ajuste de zoom antes de sair.');return;}
    try{await recovery.flush();pausePlayback();stopAudition();setVideo(undefined);setEdit(empty);setActiveProject(undefined);setHome(true);setError('');}catch(e){setError(String(e));}
  }
  async function exportVideo() {
    if(!video||exportDialog.current||busyRef.current||importRef.current)return;
    if(draftZooms){setError('Aplique ou cancele o ajuste de zoom antes de exportar.');return;}
    if(edit.zooms?.length&&!health?.zooms){setError('Reinicie o Vox Corte pela versão nova para exportar os efeitos de zoom.');return;}
    exportDialog.current=true;setChoosingExport(true);setError('');
    pausePlayback();stopAudition();
    try{
      const output=window.desktop?await window.desktop.saveVideo():(await api('/export-location',{filename:video.name})).path;
      if(!output)return;
      setChoosingExport(false);setExported(undefined);
      await task('export',{videoId:video.id,cuts:edit.cuts,zooms:edit.zooms||[],output},async r=>{
        const result=await api('/videos',{path:r.path,previewResult:true});setExported({id:result.id,path:r.path});setMessage(`Exportação concluída: ${r.path}`);
      });
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{exportDialog.current=false;setChoosingExport(false);}
  }
  const groups = useMemo(()=>{
    const rows:{word:Word;index:number}[][]=[];
    edit.words.forEach((word,index)=>{
      let row=rows.at(-1);
      if(!row||row.length>=12||word.paragraph!==row[0].word.paragraph||word.end-row[0].word.start>6){row=[];rows.push(row);}
      row.push({word,index});
    });
    return rows;
  },[edit.words]);
  function wordNode(w:Word,i:number) {
    return <span role="button" tabIndex={0} aria-label={`${w.text}, ${clock(w.start)}${deleted(w,cuts)?', excluído':''}`} aria-pressed={selected.includes(w.id)} key={w.id} data-word-id={w.id}
      className={['word',selected.includes(w.id)?'selected':'',deleted(w,cuts)?'deleted':'',time>=w.start&&time<w.end?'active':'',search&&w.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())?'match':''].join(' ')}
      onPointerDown={e=>{if(e.button!==0||busyRef.current)return;e.preventDefault();e.currentTarget.focus();pointer.current=i;select(i,e.shiftKey);}}
      onPointerEnter={e=>{if(pointer.current!==null&&e.buttons===1){const a=Math.min(anchor.current,i),b=Math.max(anchor.current,i);setSelected(edit.words.slice(a,b+1).map(w=>w.id));}}}
      onKeyDown={e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();select(i,e.shiftKey);}
        if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=Math.max(0,Math.min(edit.words.length-1,i+(e.key==='ArrowRight'?1:-1)));select(n,e.shiftKey);panel.current?.querySelector<HTMLElement>(`[data-word-id="${edit.words[n].id}"]`)?.focus();}
        if((e.ctrlKey||e.metaKey)&&e.key==='a'){e.preventDefault();setSelected(edit.words.map(w=>w.id));}
      }}>{w.text}{' '}</span>;
  }
  const cutActions=useRef({inspect:inspectCut,listen,compare:compareCut,change:(next:Cut[])=>change({...edit,cuts:next})});
  cutActions.current={inspect:inspectCut,listen,compare:compareCut,change:(next:Cut[])=>change({...edit,cuts:next})};
  const cutMarkers=useMemo(()=>cuts.map(c=><button key={c.id} className="cut-mark" style={{left:`${c.start/(video?.duration||1)*100}%`,width:`${(c.end-c.start)/(video?.duration||1)*100}%`}} title={`Ver corte ${clock(c.start)}–${clock(c.end)}`} aria-label={`Ver corte ${clock(c.start)}–${clock(c.end)}`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();cutActions.current.inspect(c);}}/>),[cuts,video?.duration]);
  if(home)return <><ProjectLibrary api={api} ready={!!config&&!!health} open={openSavedProject} importFile={()=>projectInput.current?.click()} recover={recovery.offer?()=>loadProject(new File([JSON.stringify(recovery.offer)],'recuperado.falacorte.json')):undefined}/>{error&&<div role="alert">{error}</div>}<input ref={projectInput} hidden type="file" accept=".json" onChange={e=>{if(e.target.files?.[0])void loadProject(e.target.files[0]);e.target.value='';}}/></>;
  return <main onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);const file=e.dataTransfer.files[0];if(file)importVideo(file);}}>
    <header><div className="brand"><img src={wordmark} alt="VoxCorte" width="240" height="80"/></div><div className="header-actions"><button title="Voltar aos projetos" disabled={!!job||!!importState||choosingExport} onClick={backToProjects}><FolderOpen size={18}/>Projetos</button><span>{activeProject?.projectName}</span><button title="Abrir projeto" disabled={(!!job||!!importState)} onClick={()=>projectInput.current?.click()}><FolderOpen size={18}/></button><button title="Salvar projeto" disabled={!video||(!!job||!!importState)} onClick={saveProject}><Save size={18}/></button></div></header>
<nav className="toolbar"><button disabled={(!!job||!!importState)} onClick={()=>window.desktop?importVideo():input.current?.click()}><Upload size={18}/>Importar</button><button disabled={!video||(!!job||!!importState)||!chosenModel?.ready||!video.audio||!health?.whisper} onClick={()=>task('transcribe',{videoId:video!.id,model,language,device},r=>{change({...edit,words:r.words});setMessage(`Transcrição concluída em ${r.device.toUpperCase()}.`);})}><Mic size={18}/>Transcrever</button><div className="separator"/><button title="Desfazer" disabled={!past.length||(!!job||!!importState)} onClick={undo}><Undo2 size={18}/></button><button title="Refazer" disabled={!future.length||(!!job||!!importState)} onClick={redo}><Redo2 size={18}/></button><button className="primary" disabled={!video?.audio||(!!job||!!importState)||!health?.whisper} onClick={()=>task('tighten',{videoId:video!.id,words:edit.words.map(w=>({start:w.start,end:w.end}))},r=>{const detected=mergeCuts(r.cuts,video!.duration).reduce((sum,c)=>sum+c.end-c.start,0);if(detected/video!.duration>.8){setError('A análise removeria mais de 80% do vídeo. Os cortes não foram aplicados. Gere a transcrição e revise a fala antes de tentar novamente.');return;}change({...edit,cuts:replaceAutomaticCuts(edit.cuts,r.cuts)});stopAudition();setCandidates(null);setApproved([]);setMessage(r.cuts.length?`${r.cuts.length} cortes aplicados: silêncios e respirações entre falas excluídos.`:'Nenhuma pausa fora da fala encontrada.');})}><Scissors size={18}/>{edit.cuts.some(c=>c.automatic||c.label==='Corte seco entre falas')?'Revisar cortes automáticos':'Excluir silêncios e respirações'}</button><button className="primary export" title="Escolher onde salvar o MP4" disabled={!video||(!!job||!!importState)||choosingExport||removed>=video.duration} onClick={exportVideo}><Download size={18}/>{choosingExport?'Escolhendo destino…':'Exportar MP4'}</button></nav>
    <nav className="editor-rail" aria-label="Painéis do editor"><button aria-pressed={activeTool==='text'} onClick={()=>openTool('text')}><Text size={23}/><span>Transcrição</span></button><button aria-pressed={activeTool==='cuts'} onClick={()=>openTool('cuts')}><Scissors size={23}/><span>Cortes</span></button><button aria-pressed={activeTool==='zoom'} onClick={()=>openTool('zoom')}><Focus size={23}/><span>Zoom</span></button><button aria-pressed={activeTool==='settings'} onClick={()=>openTool('settings')}><SlidersHorizontal size={23}/><span>Ajustes</span></button><button disabled={!!job||!!importState} onClick={()=>projectInput.current?.click()}><FolderOpen size={23}/><span>Projeto</span></button></nav>
    <div className="status-stack">
    {!config&&window.desktop&&<div role="status" className="notice">Iniciando processamento local. A primeira abertura pode demorar enquanto o Windows verifica as dependências.</div>}
    {error&&<div role="alert" className="notice error">{error}<button title="Fechar aviso" onClick={()=>setError('')}><X size={16}/></button></div>}
    {message&&<div role="status" className="notice notice-result"><CheckCircle2 size={17} aria-hidden="true"/><span>{message}</span><button title="Fechar mensagem" aria-label="Fechar mensagem" onClick={()=>setMessage('')}><X size={16}/></button></div>}
    {exported&&<div className="notice"><a href={`${config?.url}/media/${exported.id}?token=${config?.token}&download=true`} download><Download size={16}/>Baixar MP4 exportado</a></div>}
    {!video&&recovery.offer&&<div className="notice recovery-offer" role="status"><span>Projeto recuperável: <strong>{recovery.offer.videoName}</strong></span><button disabled={!!job||!!importState} onClick={()=>loadProject(new File([JSON.stringify(recovery.offer)],'recuperado.falacorte.json',{type:'application/json'}))}><RotateCcw size={16}/>Recuperar projeto</button><button title="Dispensar recuperação" onClick={recovery.dismiss}><X size={16}/></button></div>}
    {video&&<div className="autosave-status" role="status">{recovery.state}</div>}
    {job&&<TaskLoading compact title={job.kind==='thumbnails'?'Gerando miniaturas':job.kind==='transcribe'?'Transcrevendo fala':job.kind==='export'?'Exportando MP4':job.kind==='download'?'Baixando modelo':job.kind==='preview'?'Preparando prévia':'Processando vídeo'} message={job.message} progress={job.progress} detail={[job.totalBytes?`${((job.bytes||0)/1e6).toFixed(1)} / ${(job.totalBytes/1e6).toFixed(1)} MB`:null,job.speed?`Velocidade: ${job.speed}`:null,job.kind==='export'?exportEstimate(job.duration,job.progress,job.speed):null,job.kind==='export'&&job.progress>=.99?'Finalizando arquivo…':null].filter(Boolean).join(' · ')} onCancel={cancel} cancelDisabled={!job.id}/>}
    </div>
    <section className="workspace">
      <section className="preview"><div className="section-title"><h1>Vídeo</h1></div>
<div className={'player '+(drag?'drag':'')}>{importState&&<TaskLoading title="Importando vídeo" filename={importState.filename} message={importState.message} progress={importState.progress} phase={importState.phase} detail={importState.total?`${(importState.bytes/1e6).toFixed(1)} / ${(importState.total/1e6).toFixed(1)} MB`:undefined} onCancel={()=>importCancel.current?.()} cancelDisabled={!importCancel.current} cancelLabel="Cancelar importação"/>}{video?<><div className="video-stage" style={{aspectRatio:video.width/video.height||16/9,'--source-ratio':video.width/video.height||16/9} as CSSProperties}><video ref={player} crossOrigin="anonymous" preload="metadata" playsInline className={smoothMode!=='fallback'||!previewReady?'pending-video':''} src={`${config?.url}/media/${mediaId}?token=${config?.token}`} onLoadedMetadata={()=>{if(smoothModeRef.current==='fallback')playback.seek(seekTarget.current);}} onError={()=>{if(smoothModeRef.current==='fallback'){setPreviewFailed(true);setError('Este formato precisa de conversão local para ser exibido no player.');}}} onPlay={()=>{stopAudition();if(smoothModeRef.current!=='fallback'||!previewReady)player.current?.pause();}} onClick={togglePlay}/>{smoothMode!=='fallback'&&<SmoothPreview controller={smooth} src={`${config?.url}/media/${mediaId}?token=${config?.token}`} duration={video.duration} fps={video.fps||30} cuts={edit.cuts} onTime={setTime} onPlaying={setPlaying} onReady={()=>{player.current?.pause();setSmoothMode('ready');}} onError={e=>{setSmoothMode('fallback');setMessage(`Prévia compatível ativa. Reprodução fluida indisponível neste formato: ${e instanceof Error?e.message:String(e)}`);}} onClick={togglePlay}/>}{!importState&&smoothMode==='loading'&&<TaskLoading title="Preparando prévia" message="Abrindo áudio e vídeo para edição…" progress={null} phase="preview"/>}</div><PlayerControls player={player} time={originalToEdited(time,cuts,video.duration)} duration={video.duration-removed} fps={video.fps} playing={playing} disabled={!previewReady||!!importState} onSeek={t=>seek(editedToOriginal(t,cuts,video.duration))} onPlay={togglePlay} onError={setError} onVolume={v=>smooth.current?.setVolume(v)} onMuted={v=>smooth.current?.setMuted(v)}/></>:<div className="empty-video"><Film size={52}/><h2>Importar vídeo</h2><button className="primary" onClick={()=>window.desktop?importVideo():input.current?.click()}><Upload size={18}/>Escolher arquivo</button></div>}</div>
        {video&&<audio ref={audition} hidden preload="none" src={`${config?.url}/media/${previewId||video.id}?token=${config?.token}`} onLoadedMetadata={startAudition} onEnded={stopAudition} onError={()=>{if(auditionRange.current){stopAudition();setError('Não foi possível ouvir o trecho. Converta a prévia deste formato e tente novamente.');}}}/>}
        {video&&removed>=video.duration&&<div className="preview-status" role="status">Todo o vídeo foi excluído. Restaure um corte.</div>}
        {previewFailed&&video&&<button disabled={(!!job||!!importState)} onClick={()=>{seekTarget.current=time;task('preview',{videoId:video.id},async r=>{const proxy=await api('/videos',{path:r.path,previewResult:true});setPreviewId(proxy.id);setPreviewFailed(false);setError('');});}}><Film size={16}/>Converter prévia</button>}
        <div className="media-info"><strong>{video?.name||'Nenhum vídeo importado'}</strong>{video&&<span>{video.width} × {video.height} · {video.fps.toFixed(1)} fps · {(video.size/1e6).toFixed(1)} MB</span>}</div>
      </section>
      <section className="transcription"><div className="transcript-tabs" role="tablist" aria-label="Texto e cortes"><button role="tab" aria-selected={sideView==='text'} onClick={()=>{setSideView('text');setActiveTool('text');}}>Transcrição da fala</button><button role="tab" aria-selected={sideView==='cuts'} onClick={()=>{setSideView('cuts');setActiveTool('cuts');}}>Cortes <span>{edit.cuts.length}</span></button></div>
        <div className="transcript-content" hidden={sideView!=='text'}><div className="search"><Search size={17}/><input aria-label="Buscar palavras" placeholder="Buscar palavras" value={search} onChange={e=>setSearch(e.target.value)}/><span>{search?edit.words.filter(w=>w.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())).length:''}</span></div>
        <div className="text-panel" ref={panel} onPointerUp={()=>{pointer.current=null;}} onPointerLeave={()=>{pointer.current=null;}}>
          {!edit.words.length?<div className="empty-text"><Mic size={32}/><p>{video?'Transcrição ainda não gerada':'Nenhuma transcrição'}</p></div>:groups.map(group=><div className="transcript-row" key={group[0].word.id}><input type="checkbox" aria-label={`Manter trecho ${clock(group[0].word.start)}`} checked={!group.every(({word})=>deleted(word,cuts))} disabled={!!job||!!importState} onChange={e=>{const intervals=selectionCuts(edit.words,group.map(({word})=>word.id));change({...edit,cuts:e.target.checked?restoreIntervals(edit.cuts,intervals):[...edit.cuts,...intervals]});}}/><button className="paragraph-time" title="Ir para este trecho" onClick={()=>seek(group[0].word.start)}>{clock(group[0].word.start)}</button><p className="paragraph">{group.map(({word,index})=>wordNode(word,index))}</p></div>)}
        </div><div className="selection-bar"><span>{selected.length} selecionada(s)</span><button disabled={!selected.length||(!!job||!!importState)} onClick={restore}><RotateCcw size={16}/>Restaurar</button><button className="danger" disabled={!selected.length||(!!job||!!importState)} onClick={()=>remove()}><Scissors size={16}/>Excluir trecho</button></div>
        <details className="text-correction"><summary>Corrigir texto</summary><div className="correction"><input aria-label="Texto corrigido" value={correction} disabled={selected.length!==1||(!!job||!!importState)} onChange={e=>setCorrection(e.target.value)} placeholder="Texto da palavra selecionada"/><button disabled={selected.length!==1||!correction.trim()||(!!job||!!importState)} onClick={()=>change({...edit,words:edit.words.map(w=>selected.includes(w.id)?{...w,text:correction.trim()}:w)})}>Aplicar correção</button></div></details></div>
        <div className="cuts-content" hidden={sideView!=='cuts'}><CutList cuts={edit.cuts} removed={removed} duration={video?.duration||0} disabled={!!job||!!importState} focused={focusedCut} actions={cutActions}/></div>
      </section>
    </section>
    <section className="timeline"><div className="section-title"><h2>Linha do tempo</h2><span>Duração: {clock((video?.duration||0)-removed)}</span></div>
      <ClipTimeline key={video?.id||'empty'} duration={video?.duration||0} fps={video?.fps||30} name={video?.name||''} cuts={edit.cuts} splits={edit.splits||noSplits} thumbnails={thumbnails} time={time} playing={playing} disabled={!video||!!job||!!importState||!previewReady} onSeek={seek} onRange={setRange} onSplit={t=>change({...edit,splits:[...edit.splits||[],t]})} onPlay={togglePlay} onChange={next=>{change({...edit,cuts:next});setRange({start:null,end:null});}}/>
      <details className="source-selection" ref={sourceSelection}><summary>Seleção manual na fonte</summary>
      <div className="wave" role="slider" tabIndex={0} aria-label="Posição do vídeo" aria-valuemin={0} aria-valuemax={video?.duration||0} aria-valuenow={time}
        onPointerDown={e=>{if(e.button!==0||!video||busyRef.current)return;e.currentTarget.setPointerCapture(e.pointerId);timelineDrag.current={x:e.clientX,time:timelineTime(e)};}}
        onPointerMove={e=>{const d=timelineDrag.current;if(d&&Math.abs(e.clientX-d.x)>4){const t=timelineTime(e);setRange({start:Math.min(d.time,t),end:Math.max(d.time,t)});}}}
        onPointerUp={e=>{const d=timelineDrag.current;if(!d)return;const t=timelineTime(e);if(Math.abs(e.clientX-d.x)>4){setRange({start:Math.min(d.time,t),end:Math.max(d.time,t)});seek(Math.min(d.time,t));}else seek(t);timelineDrag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onPointerCancel={()=>{timelineDrag.current=null;}}
        onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();seek(Math.max(0,Math.min(video?.duration||0,time+(e.key==='ArrowRight'?1:-1))));}}}>
        {cutMarkers}
        {rangeReady&&<div className="interval-highlight" style={{left:`${range.start!/(video?.duration||1)*100}%`,width:`${(range.end!-range.start!)/(video?.duration||1)*100}%`}}/>}<div className="playhead" style={{left:`${time/(video?.duration||1)*100}%`}}/>
      </div><div className="ruler"><span>00:00</span><span>{clock((video?.duration||0)/2)}</span><span>{clock(video?.duration||0)}</span></div>
      <div className="range-controls"><button disabled={!video||(!!job||!!importState)} onClick={()=>setRange(r=>({...r,start:time}))}>Marcar início</button><label>Início do intervalo<input type="number" step="0.01" min={0} max={video?.duration} value={range.start??''} disabled={!video||(!!job||!!importState)} onChange={e=>setRange(r=>({...r,start:e.target.value===''?null:Number(e.target.value)}))}/></label><button disabled={!video||(!!job||!!importState)} onClick={()=>setRange(r=>({...r,end:time}))}>Marcar fim</button><label>Fim do intervalo<input type="number" step="0.01" min={0} max={video?.duration} value={range.end??''} disabled={!video||(!!job||!!importState)} onChange={e=>setRange(r=>({...r,end:e.target.value===''?null:Number(e.target.value)}))}/></label><span>{rangeReady?`${(range.end!-range.start!).toFixed(2)} s selecionados`:'Nenhum intervalo selecionado'}</span><button className="danger" disabled={!rangeReady||(!!job||!!importState)} onClick={removeRange}><Scissors size={16}/>Excluir intervalo</button><button title="Limpar intervalo" disabled={range.start===null&&range.end===null} onClick={()=>setRange({start:null,end:null})}><X size={16}/></button></div></details>
    </section>
    {candidates!==null&&<section className="cut-list"><div className="section-title"><h2>Possíveis respirações</h2><span>{candidates.length} candidatos · {approved.length} selecionados</span></div>{!candidates.length&&<p className="muted">Nenhum candidato encontrado nesta sensibilidade.</p>}{candidates.map(c=><div className="cut-row" key={c.id}><input type="checkbox" aria-label={`Selecionar respiração ${clock(c.start)}`} checked={approved.includes(c.id)} onChange={e=>setApproved(a=>e.target.checked?[...a,c.id]:a.filter(id=>id!==c.id))}/><span>{clock(c.start)} – {clock(c.end)} · {c.label}</span><button title="Ouvir candidato" onClick={()=>listen(c)}><Play size={16}/>Ouvir</button></div>)}<div className="candidate-actions"><button className="danger" disabled={!candidates.length||(!!job||!!importState)} title="Excluir todas as respirações encontradas" onClick={()=>applyCandidates(true)}><Scissors size={16}/>Excluir todas</button><button disabled={!approved.length||(!!job||!!importState)} onClick={()=>applyCandidates(false)}><Scissors size={16}/>Excluir selecionados</button><button onClick={()=>{setCandidates(null);setApproved([]);}}>Descartar análise</button></div></section>}
    <aside className="editing-tools" aria-label="Ferramentas de edição"><div className="tools-heading"><h2>Ferramentas de edição</h2><span className={'local '+(health?'ok':'')}>{health?'Processamento local':'Conectando…'}</span></div>
      <section className="processing-settings"><h3><Mic size={17}/>Transcrição</h3><div className="settings"><label>Idioma<select value={language} onChange={e=>setLanguage(e.target.value)} disabled={!!job||!!importState}><option value="pt">Português</option><option value="auto">Detectar automaticamente</option><option value="en">Inglês</option><option value="es">Espanhol</option><option value="fr">Francês</option></select></label><label>Processamento<select value={device} onChange={e=>setDevice(e.target.value)} disabled={!!job||!!importState}><option value="cpu">CPU</option><option value="cuda">NVIDIA {health?.cuda?'disponível':'(fallback CPU)'}</option></select></label></div>
      <div className="model-row"><label>Modelo<select value={model} onChange={e=>setModel(e.target.value)} disabled={!!job||!!importState}>{models.map(m=><option key={m.id} value={m.id}>{m.id} · ~{m.estimatedMB} MB</option>)}</select></label><button disabled={!!job||!!importState||chosenModel?.ready||!health?.whisper} onClick={()=>task('download',{model},()=>{api('/models').then(setModels);setMessage('Modelo disponível para uso offline.');})}><Download size={16}/>{chosenModel?.ready?'Instalado':'Baixar modelo'}</button></div>
      {health&&(!health.ffmpeg||!health.whisper)&&<p className="dependency">Dependências ausentes. Execute Instalar.ps1 para instalar FFmpeg e faster-whisper.</p>}</section>
      <details className="breath-review"><summary><Wind size={17}/>Revisão manual de respirações</summary><div className="breath-controls"><label>Sensibilidade de respiração<select value={sensitivity} disabled={!!job||!!importState} onChange={e=>setSensitivity(Number(e.target.value))}><option value={1}>Baixa</option><option value={2}>Média</option><option value={3}>Alta</option></select></label><button disabled={!video?.audio||!!job||!!importState||!health?.whisper} onClick={()=>task('breaths',{videoId:video!.id,words:edit.words.map(w=>({start:w.start,end:w.end})),sensitivity},r=>{setCandidates(r.candidates);setApproved([]);setMessage(`${r.candidates.length} possíveis respirações encontradas.`);})}><Wind size={18}/>Detectar respirações</button></div></details>
      <ZoomPanel duration={video?.duration||0} time={time} cuts={edit.cuts} zooms={edit.zooms||noZooms} settings={edit.zoomSettings} onSettings={settings=>change({...edit,zoomSettings:settings,zooms:(edit.zooms||[]).filter(z=>!z.automatic||!settings.excluded.some(c=>c.start<z.end&&c.end>z.start))})} range={rangeReady?{start:range.start!,end:range.end!}:selected.length?{start:Math.min(...edit.words.filter(w=>selected.includes(w.id)).map(w=>w.start)),end:Math.max(...edit.words.filter(w=>selected.includes(w.id)).map(w=>w.end))}:undefined} disabled={!video||!!job||!!importState} onChange={zooms=>change({...edit,zooms})} onPreview={setDraftZooms} onSeek={t=>{pausePlayback();seek(t);}}/>
    </aside>
    <input ref={input} hidden type="file" accept="video/*,.mkv,.avi" onChange={e=>{if(e.target.files?.[0])importVideo(e.target.files[0]);e.target.value='';}}/><input ref={projectInput} hidden type="file" accept=".json" onChange={e=>{if(e.target.files?.[0])loadProject(e.target.files[0]);e.target.value='';}}/>
  </main>;
}
