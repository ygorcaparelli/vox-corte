import {RefObject,useState} from 'react';
import {Play,Pause,Volume2,VolumeX,Maximize} from 'lucide-react';
type Props={player:RefObject<HTMLVideoElement|null>;time:number;duration:number;fps:number;playing:boolean;disabled:boolean;onSeek:(time:number)=>void;onPlay:()=>void;onError:(message:string)=>void;onVolume?:(volume:number)=>void;onMuted?:(muted:boolean)=>void};
const stamp=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
export default function PlayerControls(p:Props){
  const [volume,setVolume]=useState(1),[muted,setMuted]=useState(false);
  return <div className="player-controls">
    <input className="player-position" type="range" aria-label="Posição na prévia" min={0} max={p.duration||0} step={1/(p.fps||30)} value={Math.min(p.time,p.duration)} disabled={p.disabled} onChange={e=>p.onSeek(Number(e.target.value))}/>
    <button title={p.playing?'Pausar prévia':'Reproduzir prévia'} disabled={p.disabled} onClick={p.onPlay}>{p.playing?<Pause size={18}/>:<Play size={18}/>}</button>
    <output aria-label="Tempo da prévia">{stamp(p.time)} / {stamp(p.duration)}</output>
    <button title={muted?'Ativar som':'Silenciar'} onClick={()=>{const next=!muted;setMuted(next);if(p.player.current)p.player.current.muted=next;p.onMuted?.(next);}}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>
    <input className="player-volume" type="range" aria-label="Volume da prévia" min={0} max={1} step={.05} value={volume} onChange={e=>{const value=Number(e.target.value);setVolume(value);if(p.player.current)p.player.current.volume=value;p.onVolume?.(value);}}/>
    <button title="Tela cheia" onClick={()=>p.player.current?.closest<HTMLElement>('.player')?.requestFullscreen().catch(e=>p.onError(e.message))}><Maximize size={17}/></button>
  </div>;
}
