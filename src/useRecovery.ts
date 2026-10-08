import {useEffect,useRef,useState} from 'react';
import {Edit} from './editor';
export type RecoveryProject={version:1;videoPath:string;videoName:string;updatedAt:number;edit:Edit;projectId?:string};
type Config={url:string;token:string};
const KEY='voxcorte-recovery-v1';
export function useRecovery(config:Config|undefined,video:{path:string;name:string}|undefined,edit:Edit,projectId?:string){
  const [offer,setOffer]=useState<RecoveryProject|null>(null),[state,setState]=useState('');
  const pending=useRef<RecoveryProject|undefined>(undefined),writing=useRef(false),latest=useRef(config);latest.current=config;
  const queuedTarget=useRef<string|undefined>(undefined);
  async function flush(){
    const c=latest.current;if(!c||writing.current||!pending.current)return;
    writing.current=true;const project=pending.current;pending.current=undefined;
    try{
      const response=await fetch(c.url+(queuedTarget.current?'/projects/'+queuedTarget.current:'/recovery'),{method:'PUT',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify(project)});
      if(!response.ok)throw Error('Falha ao salvar');
      setState(pending.current?'Salvando…':'Salvo automaticamente');
    }catch{if(!pending.current)pending.current=project;setState('Falha no salvamento automático');}
    finally{writing.current=false;}
  }
  useEffect(()=>{
    if(!config)return;let alive=true;
    (async()=>{
      let local:RecoveryProject|null=null;
      try{local=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
      if(local?.projectId){
        try{await fetch(config.url+'/projects/'+local.projectId,{method:'PUT',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(local)});}catch{}
        local=null;
      }
      try{
        const r=await fetch(config.url+'/recovery',{headers:{Authorization:`Bearer ${config.token}`}});
        const remote=r.ok?await r.json():null;
        const candidate=local&&local.updatedAt>(remote?.updatedAt||0)?local:remote;
        if(alive)setOffer(candidate&&candidate.updatedAt>Number(localStorage.getItem(KEY+'-dismissed')||0)?candidate:null);
      }catch{if(alive)setOffer(local);}
    })();
    return()=>{alive=false;};
  },[config]);
  useEffect(()=>{
    if(!video||!projectId)return;
    const project:RecoveryProject={version:1,projectId,videoPath:video.path,videoName:video.name,updatedAt:Date.now(),edit};
    pending.current=project;queuedTarget.current=projectId;setState('Salvando…');setOffer(null);
    try{localStorage.setItem(KEY,JSON.stringify(project));}catch{setState('Salvando no serviço local…');}
    const timer=setTimeout(()=>void flush(),450);return()=>clearTimeout(timer);
  },[video,edit,projectId]);
  useEffect(()=>{
    const retry=setInterval(()=>{if(pending.current)void flush();},2000);
    const closing=()=>{const c=latest.current,p=pending.current;if(c&&p)void fetch(c.url+(queuedTarget.current?'/projects/'+queuedTarget.current:'/recovery'),{method:'PUT',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(()=>{});};
    window.addEventListener('pagehide',closing);return()=>{clearInterval(retry);window.removeEventListener('pagehide',closing);};
  },[]);
  async function drain(){
    while(writing.current)await new Promise(resolve=>setTimeout(resolve,25));
    if(pending.current)await flush();
    if(pending.current)throw Error('Não foi possível salvar. Tente novamente antes de sair.');
  }
  return {offer,state,flush:drain,dismiss:()=>{if(offer)localStorage.setItem(KEY+'-dismissed',String(offer.updatedAt));setOffer(null);}};
}
