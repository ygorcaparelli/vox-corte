import {X} from 'lucide-react';
import wordmark from './assets/voxcorte-wordmark.png';
import './loading.css';

type Props={title:string;message:string;progress:number|null;detail?:string;filename?:string;phase?:'transfer'|'verify'|'preview';onCancel?:()=>void;cancelDisabled?:boolean;cancelLabel?:string;compact?:boolean};
export default function TaskLoading(p:Props){
  const progress=p.progress!==null&&Number.isFinite(p.progress)?Math.max(0,Math.min(1,p.progress)):null;
  const current=p.phase==='transfer'?0:p.phase==='verify'?1:2;
  return <div className={`task-loading job ${p.compact?'loading-compact':'import-loading'}`} role="status" aria-live="polite">
    {!p.compact&&<img className="loading-brand" src={wordmark} alt="VoxCorte" width="210" height="70"/>}
    <div className="loading-heading"><div className="loading-signal" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i}/>)}</div><div className="loading-copy"><h2>{p.title}</h2>{p.filename&&<span className="loading-filename" title={p.filename}>{p.filename}</span>}<p>{p.message}</p></div><output aria-live="off">{progress===null?'···':`${Math.round(progress*100)}%`}</output></div>
    <div className={`loading-track ${progress===null?'loading-indeterminate':''}`} role="progressbar" aria-label={p.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress===null?undefined:Math.round(progress*100)} aria-valuetext={progress===null?p.message:undefined}><div className="loading-fill" style={progress===null?undefined:{width:`${progress*100}%`}}/></div>
    {!p.compact&&p.phase&&<ol className="loading-phases" aria-label="Etapas da importação">{['Transferência','Verificação','Prévia'].map((label,i)=><li key={label} className={i===current?'current':i<current?'complete':''} aria-current={i===current?'step':undefined}><span>{String(i+1).padStart(2,'0')}</span>{label}</li>)}</ol>}
    <div className="loading-footer">{p.detail&&<small aria-live="off">{p.detail}</small>}{p.onCancel&&<button disabled={p.cancelDisabled} onClick={p.onCancel}><X size={15}/>{p.cancelLabel||'Cancelar'}</button>}</div>
  </div>;
}
