import {useEffect,useMemo,useRef,useState} from 'react';
import {Film,ZoomIn,ZoomOut,Maximize2,Scissors,Trash2,Play,Pause,ChevronLeft,ChevronRight,MousePointer2,X} from 'lucide-react';
import {Cut,keptSegments,originalToEdited,editedToOriginal,trimSegment,trimBoundary} from './editor';
import {timelineScale,scaleToSlider,sliderToScale} from './timelineScale';
export type Thumbnail={time:number;image:string};
type Props={duration:number;fps:number;name:string;cuts:Cut[];splits:number[];thumbnails:Thumbnail[];time:number;playing:boolean;disabled:boolean;onSeek:(time:number)=>void;onRange?:(range:{start:number|null;end:number|null})=>void;onChange:(cuts:Cut[])=>void;onSplit:(time:number)=>void;onPlay:()=>void};
const stamp=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(2).padStart(5,'0')}`;
export default function ClipTimeline(p:Props){
  const latest=useRef(p);latest.current=p;
  const viewport=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(800),[left,setLeft]=useState(0),[zoom,setZoom]=useState<number|null>(48);
  const zoomAnchor=useRef<{time:number;x:number}|null>(null);
  const [draft,setDraft]=useState<Cut[]|null>(null),[active,setActive]=useState<number|null>(null);
  const [selectMode,setSelectMode]=useState(false),[selection,setSelection]=useState<{start:number;end:number}|null>(null);
  const selecting=useRef<number|null>(null);
  const drag=useRef<{x:number;left:number;boundary:number;target:number;index:number;edge:'start'|'end';cuts:Cut[];scale:number;next:Cut[]}|null>(null);
  const pan=useRef<{x:number;left:number;moved:boolean}|null>(null);
  const scrubbing=useRef(false);
  const fps=Number.isFinite(p.fps)&&p.fps>0?p.fps:30;
  const frame=(t:number)=>Math.round(t*fps)/fps;
  useEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>{if(el.clientWidth>0)setWidth(el.clientWidth);});observer.observe(el);return()=>observer.disconnect();},[]);
  useEffect(()=>{setDraft(null);setActive(null);setSelection(null);selecting.current=null;},[p.duration,p.cuts,p.splits]);
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){drag.current=null;pan.current=null;selecting.current=null;setDraft(null);setActive(null);setSelection(null);latest.current.onRange?.({start:null,end:null});}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel);},[]);
  const cuts=draft||p.cuts;
  let segments=useMemo(()=>keptSegments(cuts,p.duration,p.splits),[cuts,p.duration,p.splits]);
  if(drag.current){const d=drag.current;let cursor=0;segments=keptSegments(d.cuts,p.duration,p.splits).map((s,i)=>{const start=i===d.index&&d.edge==='start'?d.target:s.start,end=i===d.index&&d.edge==='end'?d.target:s.end;const result={start,end,editedStart:cursor,editedEnd:cursor+end-start};cursor=result.editedEnd;return result;});}
  const baseLength=useMemo(()=>keptSegments(p.cuts,p.duration).at(-1)?.editedEnd||0,[p.cuts,p.duration]);
  const {scale,fit,maximum}=timelineScale(width,baseLength,fps,zoom);
  const length=Math.max(width,baseLength*scale);
  const current=originalToEdited(p.time,cuts,p.duration);
  const original=(t:number)=>editedToOriginal(t,p.cuts,p.duration);
  const seekPosition=(t:number)=>p.onSeek(original(Math.max(0,Math.min(baseLength,t))));
  useEffect(()=>{
    const el=viewport.current;if(!el||drag.current||pan.current||scrubbing.current)return;
    const anchor=zoomAnchor.current;
    if(anchor){zoomAnchor.current=null;el.scrollLeft=Math.max(0,anchor.time*scale-anchor.x);setLeft(el.scrollLeft);return;}
    const target=current*scale;
    if(target<el.scrollLeft)el.scrollLeft=target;
    else if(target>el.scrollLeft+width-2)el.scrollLeft=target-width+2;
  },[current,scale,width]);
  function changeZoom(next:number|null){
    const el=viewport.current;
    if(timelineScale(width,baseLength,fps,next).scale===scale){zoomAnchor.current=null;setZoom(next);if(el&&next===null){el.scrollLeft=0;setLeft(0);}return;}
    if(el&&next!==null){
      const playhead=current*scale-el.scrollLeft;
      const x=playhead>=0&&playhead<width?playhead:width/2;
      zoomAnchor.current={time:(el.scrollLeft+x)/scale,x};
    }else if(el){zoomAnchor.current={time:0,x:0};}
    setZoom(next);
    if(el&&next===null){el.scrollLeft=0;setLeft(0);}
  }
  function scrolled(){setLeft(viewport.current!.scrollLeft);}
  function scrub(e:React.PointerEvent){const el=viewport.current!;seekPosition((e.clientX-el.getBoundingClientRect().left+el.scrollLeft)/scale);}
  function begin(e:React.PointerEvent<HTMLButtonElement>,index:number,edge:'start'|'end'){
    if(p.disabled)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    setSelection(null);drag.current={x:e.clientX,left:viewport.current!.scrollLeft,boundary:segments[index][edge],target:segments[index][edge],index,edge,cuts:p.cuts,scale,next:p.cuts};setActive(index);
  }
  function autoScroll(x:number){const el=viewport.current!,r=el.getBoundingClientRect();if(x<r.left+16)el.scrollLeft-=12;else if(x>r.right-16)el.scrollLeft+=12;}
  function move(e:React.PointerEvent<HTMLButtonElement>){const d=drag.current;if(!d)return;autoScroll(e.clientX);d.target=trimBoundary(d.cuts,p.duration,d.index,d.edge,frame(d.boundary+(e.clientX-d.x+viewport.current!.scrollLeft-d.left)/d.scale),p.splits)??d.boundary;d.next=trimSegment(d.cuts,p.duration,d.index,d.edge,d.target,p.splits);setDraft(d.next);}
  function finish(e:React.PointerEvent<HTMLButtonElement>,cancel=false){const d=drag.current;if(!d)return;drag.current=null;setDraft(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(!cancel&&d.next!==d.cuts)p.onChange(d.next);}
  const selected=active===null?undefined:segments[active];
  const splitTime=frame(p.time),canSplit=segments.some(s=>splitTime>s.start+1/fps/2&&splitTime<s.end-1/fps/2);
  function split(){if(!p.disabled&&canSplit)p.onSplit(splitTime);}
  function remove(){if(p.disabled||!selected)return;p.onChange([...p.cuts,{id:crypto.randomUUID(),start:selected.start,end:selected.end,label:'Clipe excluído'}]);setActive(null);}
  function deleteSelection(){
    if(p.disabled)return;
    if(selection&&selection.end>selection.start){
      const intervals=segments.map(s=>({start:Math.max(s.editedStart,selection.start),end:Math.min(s.editedEnd,selection.end),s})).filter(r=>r.end>r.start);
      p.onChange([...p.cuts,...intervals.map(r=>({id:crypto.randomUUID(),start:r.s.start+r.start-r.s.editedStart,end:r.s.start+r.end-r.s.editedStart,label:'Seleção na linha do tempo'}))]);
      setSelection(null);p.onRange?.({start:null,end:null});
    }else remove();
  }
  function position(e:React.PointerEvent){const el=viewport.current!;return frame(Math.max(0,Math.min(baseLength,(e.clientX-el.getBoundingClientRect().left+el.scrollLeft)/scale)));}
  const rawStep=Math.max(1/fps,90/scale),power=10**Math.floor(Math.log10(rawStep));
  const tickStep=[1,2,5,10].find(n=>n*power>=rawStep)!*power;
  const ticks=[];for(let t=Math.max(0,Math.floor(left/scale/tickStep)*tickStep);t<=Math.min(baseLength,(left+width)/scale+tickStep);t+=tickStep)ticks.push(t);
  function key(e:React.KeyboardEvent){
    if((e.target as HTMLElement).closest('input,.trim-handle'))return;
    if((e.key==='Delete'||e.key==='Backspace')&&(selected||selection)){e.preventDefault();e.stopPropagation();deleteSelection();}
    else if(e.key.toLowerCase()==='b'){e.preventDefault();e.stopPropagation();split();}
    else if(e.key===' '){e.preventDefault();e.stopPropagation();if(!p.disabled)p.onPlay();}
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();if(!p.disabled)seekPosition(current+(e.key==='ArrowRight'?1:-1)/fps);}
  }
  const handlers=useRef({begin,move,finish});handlers.current={begin,move,finish};
  const clips=useMemo(()=>segments.map((s,index)=>{
    const x=s.editedStart*scale,w=(s.end-s.start)*scale;if(x+w<left-100||x>left+width+100)return null;
    const tiles=[];const first=Math.max(0,Math.floor((left-x)/96)),last=Math.min(Math.ceil(w/96),Math.ceil((left+width-x)/96)+1);
    for(let i=first;i<last;i++){const t=s.start+(i*96+48)/scale;const thumb=p.thumbnails.reduce<Thumbnail|undefined>((best,f)=>!best||Math.abs(f.time-t)<Math.abs(best.time-t)?f:best,undefined);if(thumb)tiles.push(<img key={i} src={thumb.image} alt="" draggable={false} style={{left:i*96}}/>);}
    return <div className={'timeline-clip '+(active===index?'clip-selected':'')} key={index} data-clip-index={index} style={{left:x,width:Math.max(2,w)}} role="button" tabIndex={0} aria-label={`Selecionar clipe ${index+1}`} aria-pressed={active===index} onPointerDown={e=>{if(!e.shiftKey&&!selectMode){setActive(index);setSelection(null);latest.current.onRange?.({start:s.start,end:s.end});}}} onFocus={()=>setActive(index)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setActive(index);}}}>
      <div className="filmstrip">{tiles}{w>=150&&<span title={p.name}>{p.name}</span>}</div>
      {(['start','end'] as const).map(edge=><button key={edge} className={'trim-handle '+edge} title={edge==='start'?'Ajustar início do clipe':'Ajustar fim do clipe'} aria-label={`${edge==='start'?'Início':'Fim'} do clipe ${index+1}`} disabled={p.disabled} onPointerDown={e=>handlers.current.begin(e,index,edge)} onPointerMove={e=>handlers.current.move(e)} onPointerUp={e=>handlers.current.finish(e)} onPointerCancel={e=>handlers.current.finish(e,true)} onLostPointerCapture={e=>handlers.current.finish(e,true)} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();latest.current.onChange(trimSegment(p.cuts,p.duration,index,edge,frame(s[edge]+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/fps)),p.splits));}}}><span/></button>)}
    </div>;
  }),[segments,scale,left,width,active,p.thumbnails,p.name,p.disabled,p.cuts,p.duration,p.splits,fps,selectMode]);
  return <div className="clip-editor" onKeyDown={key}>
    <div className="clip-transport"><output>{stamp(current)} <span>/ {stamp(baseLength)}</span></output><div><button title="Quadro anterior" disabled={p.disabled||current<=0} onClick={()=>seekPosition(current-1/fps)}><ChevronLeft size={18}/></button><button title={p.playing?'Pausar vídeo':'Reproduzir vídeo'} disabled={p.disabled} onClick={p.onPlay}>{p.playing?<Pause size={20}/>:<Play size={20}/>}</button><button title="Próximo quadro" disabled={p.disabled||current>=baseLength} onClick={()=>seekPosition(current+1/fps)}><ChevronRight size={18}/></button></div></div>
    <div className="clip-body"><div className="track-labels"><span><Film size={16}/>Vídeo</span></div><div className="clip-viewport-frame">
      <div className="clip-scroll" ref={viewport} onScroll={scrolled}>
        <div className={'clip-canvas '+(selectMode?'selecting-mode':'')} tabIndex={0} aria-label="Linha do tempo de vídeo" data-scale={scale} style={{width:length}}
          onPointerDown={e=>{
            if(p.disabled||e.button!==0)return;
            e.currentTarget.focus({preventScroll:true});
            if(selectMode||e.shiftKey){e.preventDefault();setActive(null);selecting.current=position(e);setSelection({start:selecting.current,end:selecting.current});e.currentTarget.setPointerCapture(e.pointerId);return;}
            pan.current={x:e.clientX,left:viewport.current!.scrollLeft,moved:false};
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e=>{if(selecting.current!==null){autoScroll(e.clientX);const t=position(e);setSelection({start:Math.min(t,selecting.current),end:Math.max(t,selecting.current)});return;}const d=pan.current;if(!d)return;if(Math.abs(e.clientX-d.x)>3)d.moved=true;if(d.moved){viewport.current!.scrollLeft=Math.max(0,Math.min(length-width,d.left+d.x-e.clientX));}}}
          onPointerUp={e=>{
            if(selecting.current!==null){const t=position(e),start=Math.min(t,selecting.current),end=Math.max(t,selecting.current);setSelection(end>start?{start,end}:null);p.onRange?.({start:end>start?original(start):null,end:end>start?original(end):null});selecting.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);return;}
            const d=pan.current;pan.current=null;
            if(d&&!d.moved){scrub(e);}
            if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
          }} onPointerCancel={()=>{pan.current=null;selecting.current=null;setSelection(null);}}>
          <div className="clip-ruler">{ticks.map(t=><span key={t} style={{left:t*scale}}>{stamp(t)}</span>)}</div>
          {clips}
          {selection&&<div className="timeline-range" data-selection-start={selection.start} data-selection-end={selection.end} style={{left:selection.start*scale,width:Math.max(2,(selection.end-selection.start)*scale)}}>{(selection.end-selection.start)*scale>=170&&<span>{stamp(selection.start)} – {stamp(selection.end)}</span>}</div>}
          {drag.current&&<output className="trim-time" style={{left:Math.min(length-80,Math.max(0,current*scale))}}>{stamp(drag.current.target)}</output>}
          <div className="clip-playhead" style={{left:Math.min(current*scale,length-2)}} role="slider" tabIndex={0} aria-label="Marcador de reprodução" aria-valuemin={0} aria-valuemax={baseLength} aria-valuenow={current} aria-disabled={p.disabled}
            onPointerDown={e=>{e.stopPropagation();if(p.disabled)return;scrubbing.current=true;e.currentTarget.setPointerCapture(e.pointerId);scrub(e);}}
            onPointerMove={e=>{if(scrubbing.current)scrub(e);}}
            onPointerUp={e=>{scrubbing.current=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
            onPointerCancel={()=>{scrubbing.current=false;}} onLostPointerCapture={()=>{scrubbing.current=false;}}/>
        </div>
      </div>
    </div></div>
    <div className="clip-tools"><button title="Selecionar intervalo" aria-pressed={selectMode} disabled={p.disabled} onClick={()=>setSelectMode(v=>!v)}><MousePointer2 size={18}/></button><button title="Dividir no marcador" aria-label="Dividir no marcador" disabled={p.disabled||!canSplit} onClick={split}><Scissors size={18}/></button><button title="Excluir clipe selecionado" aria-label="Excluir clipe selecionado" disabled={p.disabled||(!selected&&!selection)} onClick={deleteSelection}><Trash2 size={18}/></button>{selection&&<button title="Limpar seleção" onClick={()=>{setSelection(null);p.onRange?.({start:null,end:null});}}><X size={16}/></button>}<output className="clip-selection">{selection?`${stamp(selection.start)} – ${stamp(selection.end)}`:selected?`${stamp(selected.start)} – ${stamp(selected.end)}`:''}</output><div className="clip-zoom"><button title="Diminuir zoom" disabled={scale<=fit} onClick={()=>changeZoom(Math.max(fit,scale/2))}><ZoomOut size={17}/></button><input type="range" aria-label="Zoom da linha do tempo" aria-valuetext={`${Math.round(scale)} pixels por segundo`} min="0" max="100" step="0.1" value={scaleToSlider(scale,fit,maximum)} onChange={e=>changeZoom(sliderToScale(Number(e.target.value),fit,maximum))}/><button title="Aumentar zoom" disabled={scale>=maximum} onClick={()=>changeZoom(Math.min(maximum,scale*2))}><ZoomIn size={17}/></button><button title="Ajustar à janela" onClick={()=>changeZoom(null)}><Maximize2 size={17}/></button><output>{Math.round(scale)} px/s</output></div></div>
  </div>;
}
