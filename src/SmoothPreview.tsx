import {RefObject,useEffect,useRef} from 'react';
import {Cut,Zoom} from './editor';
import {SmoothPlayback} from './SmoothPlayback';
type Props={controller:RefObject<SmoothPlayback|null>;src:string;duration:number;fps:number;cuts:Cut[];zooms?:Zoom[];onTime:(time:number)=>void;onPlaying:(value:boolean)=>void;onReady:()=>void;onError:(error:unknown)=>void;onClick:()=>void};
export default function SmoothPreview(p:Props){
  const canvas=useRef<HTMLCanvasElement>(null),latest=useRef(p);latest.current=p;
  useEffect(()=>{
    const engine=new SmoothPlayback(canvas.current!,p.src,p.duration,p.fps,{time:t=>latest.current.onTime(t),playing:v=>latest.current.onPlaying(v),error:e=>latest.current.onError(e)});
    p.controller.current=engine;engine.setCuts(latest.current.cuts);engine.setZooms(latest.current.zooms||[]);
    let alive=true;
    engine.initialize().then(()=>{if(alive)latest.current.onReady();}).catch(e=>{if(alive)latest.current.onError(e);});
    return()=>{alive=false;engine.dispose();if(p.controller.current===engine)p.controller.current=null;};
  },[p.src,p.duration,p.fps]);
  useEffect(()=>{if(p.controller.current)p.controller.current.setCuts(p.cuts);},[p.cuts]);
  useEffect(()=>{p.controller.current?.setZooms(p.zooms||[]);},[p.zooms]);
  return <canvas ref={canvas} className="smooth-preview" aria-label="Vídeo com cortes" onClick={p.onClick}/>;
}
