import {useEffect,useMemo,useRef,useState} from 'react';
import {Focus,Sparkles,Trash2,Check,X} from 'lucide-react';
import {Cut,Zoom,ZoomSettings,keptSegments,originalToEdited,editedToOriginal} from './editor';
import {automaticZooms,validZoom,zoomSettings} from './zoom';
type Props={duration:number;time:number;cuts:Cut[];zooms:Zoom[];settings?:ZoomSettings;onSettings:(settings:ZoomSettings)=>void;range?:{start:number;end:number};disabled:boolean;onChange:(zooms:Zoom[])=>void;onPreview:(zooms:Zoom[]|null)=>void;onSeek:(time:number)=>void};
const stamp=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
export default function ZoomPanel(p:Props){
  const [draft,setDraft]=useState<Zoom|null>(null);
  const settings=zoomSettings(p.settings);
  const length=keptSegments(p.cuts,p.duration).at(-1)?.editedEnd||0;
  const overlap=!!draft&&p.zooms.some(z=>z.id!==draft.id&&z.start<draft.end&&z.end>draft.start);
  const valid=!!draft&&(p.zooms.length<500||p.zooms.some(z=>z.id===draft.id))&&validZoom(draft)&&draft.end<=p.duration&&!overlap&&originalToEdited(draft.end,p.cuts,p.duration)>originalToEdited(draft.start,p.cuts,p.duration);
  useEffect(()=>{setDraft(null);p.onPreview(null);},[p.zooms,p.cuts,p.duration]);
  useEffect(()=>{p.onPreview(draft?(valid?[...p.zooms.filter(z=>z.id!==draft.id),draft]:p.zooms):null);},[draft,p.zooms,valid]);
  function start(z?:Zoom){
    if(p.disabled)return;
    const segment=keptSegments(p.cuts,p.duration).find(s=>p.time>=s.start&&p.time<s.end)||keptSegments(p.cuts,p.duration)[0];
    if(!segment&&!z)return;
    const from=p.range?.start??(p.time>=segment!.start&&p.time<segment!.end?p.time:segment!.start),end=p.range?.end??Math.min(from+4,segment!.end);
    const next=z||{id:crypto.randomUUID(),start:from,end,from:1,to:1.2,x:.5,y:.5,curve:'smooth' as const};
    setDraft({...next,automatic:false,automaticMotion:undefined});p.onSeek(editedToOriginal((originalToEdited(next.start,p.cuts,p.duration)+originalToEdited(next.end,p.cuts,p.duration))/2,p.cuts,p.duration));
  }
  function update(values:Partial<Zoom>){setDraft(d=>d?{...d,...values}:d);}
  const actions=useRef({start,change:p.onChange});actions.current={start,change:p.onChange};
  const effects=useMemo(()=>p.zooms.map(z=><div key={z.id} data-zoom-id={z.id}><button disabled={p.disabled} onClick={()=>actions.current.start(z)}><Focus size={16}/><span>{stamp(originalToEdited(z.start,p.cuts,p.duration))} – {stamp(originalToEdited(z.end,p.cuts,p.duration))}</span><span>{Math.round(z.from*100)}% → {Math.round(z.to*100)}%</span></button><button disabled={p.disabled} title="Remover este zoom" onClick={()=>actions.current.change(p.zooms.filter(x=>x.id!==z.id))}><Trash2 size={16}/></button></div>),[p.zooms,p.cuts,p.duration,p.disabled]);
  return <section className="image-zoom"><div className="section-title"><h2>Zoom na imagem</h2><div className="zoom-actions"><button disabled={p.disabled||!length} onClick={()=>start()}><Focus size={17}/>Zoom manual</button><button disabled={p.disabled||!length} onClick={()=>p.onChange(automaticZooms(p.cuts,p.duration,p.zooms,p.settings))}><Sparkles size={17}/>Zoom automático</button></div></div>
    <div className="zoom-preferences">
      <label>Frequência<select aria-label="Frequência do zoom automático" disabled={p.disabled} value={settings.frequency} onChange={e=>p.onSettings({...settings,frequency:e.target.value as ZoomSettings['frequency']})}><option value="discreet">Discreto</option><option value="balanced">Equilibrado</option><option value="frequent">Frequente</option></select></label>
      <label>Intensidade <output>{settings.intensity}%</output><input aria-label="Intensidade do zoom automático" disabled={p.disabled} type="range" min="5" max="40" step="1" value={settings.intensity} onChange={e=>p.onSettings({...settings,intensity:Number(e.target.value)})}/></label>
      <button disabled={p.disabled||!p.range} onClick={()=>{if(p.range)p.onSettings({...settings,excluded:[...settings.excluded,{id:crypto.randomUUID(),...p.range,label:'Sem zoom automático'}]});}}><Focus size={16}/>Não aplicar zoom na seleção</button>
      {settings.excluded.map(c=><div className="zoom-exclusion" key={c.id}><span title="Intervalo no original">{stamp(c.start)} – {stamp(c.end)}</span><button disabled={p.disabled} title="Permitir zoom neste intervalo" onClick={()=>p.onSettings({...settings,excluded:settings.excluded.filter(x=>x.id!==c.id)})}><X size={15}/></button></div>)}
    </div>
    {draft&&<div className="zoom-settings">
      <label>Início (montagem)<input aria-label="Início do zoom" type="number" min="0" max={length} step="0.01" value={originalToEdited(draft.start,p.cuts,p.duration).toFixed(2)} onChange={e=>update({start:editedToOriginal(Number(e.target.value),p.cuts,p.duration)})}/></label>
      <label>Fim (montagem)<input aria-label="Fim do zoom" type="number" min="0" max={length} step="0.01" value={originalToEdited(draft.end,p.cuts,p.duration).toFixed(2)} onChange={e=>update({end:editedToOriginal(Number(e.target.value),p.cuts,p.duration)})}/></label>
      <label>Movimento<select aria-label="Movimento do zoom" value={draft.from===draft.to?'fixed':draft.from<draft.to?'in':'out'} onChange={e=>update(e.target.value==='fixed'?{from:1.2,to:1.2}:e.target.value==='in'?{from:1,to:1.2}:{from:1.2,to:1})}><option value="fixed">Fixo</option><option value="in">Aproximar</option><option value="out">Afastar</option></select></label>
      <label>Transição<select aria-label="Curva do zoom" value={draft.curve} onChange={e=>update({curve:e.target.value as Zoom['curve']})}><option value="smooth">Suave</option><option value="linear">Linear</option></select></label>
      {(['from','to','x','y'] as const).map(field=><label key={field}>{field==='from'?'Escala inicial':field==='to'?'Escala final':field==='x'?'Posição horizontal':'Posição vertical'}<div className="zoom-slider"><input aria-label={field==='from'?'Escala inicial':field==='to'?'Escala final':field==='x'?'Posição horizontal':'Posição vertical'} type="range" min={field==='from'||field==='to'?1:0} max={field==='from'||field==='to'?3:1} step="0.01" value={draft[field]} onChange={e=>update(draft.from===draft.to&&(field==='from'||field==='to')?{from:Number(e.target.value),to:Number(e.target.value)}:{[field]:Number(e.target.value)})}/><output>{Math.round(draft[field]*100)}%</output></div></label>)}
      <div className="zoom-actions"><button className="primary" disabled={p.disabled||!valid} onClick={()=>{if(draft){p.onChange([...p.zooms.filter(z=>z.id!==draft.id),draft].sort((a,b)=>a.start-b.start));setDraft(null);p.onPreview(null);}}}><Check size={17}/>Aplicar zoom</button><button title="Cancelar ajuste de zoom" onClick={()=>{setDraft(null);p.onPreview(null);}}><X size={17}/></button>{overlap&&<span role="alert">Este intervalo já contém outro zoom.</span>}</div>
    </div>}
    <div className="zoom-effects">{effects.length?effects:<span className="muted">Nenhum zoom aplicado</span>}</div>
  </section>;
}
