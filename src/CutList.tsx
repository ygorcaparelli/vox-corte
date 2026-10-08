import {memo,RefObject} from 'react';
import {Scissors,Play,RotateCcw,Headphones,SkipForward} from 'lucide-react';
import {Cut} from './editor';
type Actions={inspect:(cut:Cut)=>void;listen:(cut:Cut)=>void;compare:(cut:Cut,edited:boolean)=>void;change:(cuts:Cut[])=>void};
type Props={cuts:Cut[];removed:number;duration:number;disabled:boolean;focused?:string;actions:RefObject<Actions>};
const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(1).padStart(4,'0')}`;
export default memo(function CutList(p:Props){
  function boundary(c:Cut,edge:'start'|'end',input:HTMLInputElement){
    const n=Number(input.value),valid=Number.isFinite(n)&&(edge==='start'?n>=0&&n<c.end:n>c.start&&n<=p.duration);
    if(valid&&n!==c[edge])p.actions.current.change(p.cuts.map(x=>x.id===c.id?{...x,[edge]:n}:x));
    else input.value=c[edge].toFixed(2);
  }
  return <section className="cut-list"><div className="section-title"><h2>Cortes</h2><span>{p.cuts.length} cortes · {p.removed.toFixed(2)} s removidos</span></div>{!p.cuts.length?<p className="muted">Nenhum trecho excluído</p>:p.cuts.map(c=><div className={'cut-row '+(p.focused===c.id?'focused-cut':'')} data-cut-id={c.id} key={c.id} onClick={e=>{if(!(e.target as HTMLElement).closest('button,input,label'))p.actions.current.inspect(c);}}>
    <Scissors size={16}/><button className="cut-location" title="Localizar corte no original" onClick={()=>p.actions.current.inspect(c)}><span>{c.label}</span><small>{clock(c.start)} – {clock(c.end)}</small></button>
    <label>Início<input type="number" step="0.01" min="0" max={c.end-.01} defaultValue={c.start.toFixed(2)} key={c.id+'s'+c.start} disabled={p.disabled} onBlur={e=>boundary(c,'start',e.target)}/></label>
    <label>Fim<input type="number" step="0.01" min={c.start+.01} max={p.duration} defaultValue={c.end.toFixed(2)} key={c.id+'e'+c.end} disabled={p.disabled} onBlur={e=>boundary(c,'end',e.target)}/></label>
    <button disabled={p.disabled} title="Ouvir trecho removido" onClick={()=>p.actions.current.listen(c)}><Play size={16}/>Ouvir</button><button disabled={p.disabled} title="Ouvir original com contexto" onClick={()=>p.actions.current.compare(c,false)}><Headphones size={16}/></button><button disabled={p.disabled} title="Ouvir corte aplicado" onClick={()=>p.actions.current.compare(c,true)}><SkipForward size={16}/></button><button title="Restaurar este corte" disabled={p.disabled} onClick={()=>p.actions.current.change(p.cuts.filter(x=>x.id!==c.id))}><RotateCcw size={17}/></button>
  </div>)}</section>;
});
