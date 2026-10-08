import {RefObject,useLayoutEffect,useMemo,useRef} from 'react';
import {Cut,keptSegments} from './editor';

type Segment=ReturnType<typeof keptSegments>[number];
export function keptPosition(time:number,segments:Segment[]):number|null {
  for(const segment of segments){if(time<segment.start)return segment.start;if(time<segment.end)return time;}
  return segments.at(-1)?.end??null;
}

export function useCutPlayback(player:RefObject<HTMLVideoElement|null>,mediaId:string|undefined,cuts:Cut[],duration:number,fps:number,onTime:(time:number)=>void,enabled=true){
  const segments=useMemo(()=>keptSegments(cuts,duration),[cuts,duration]);
  const finished=useRef(false),publish=useRef(onTime);
  publish.current=onTime;
  const frame=1/(fps>0?fps:30);
  function seek(time:number){
    const v=player.current,target=keptPosition(time,segments),last=segments.at(-1);
    if(!v||target===null||!last)return;
    finished.current=target>=last.end;
    if(finished.current)v.pause();
    const position=finished.current?Math.max(last.start,last.end-Math.min(frame,(last.end-last.start)/2)):target;
    if(v.readyState)v.currentTime=position;
    publish.current(finished.current?last.end:target);
  }
  useLayoutEffect(()=>{
    const v=player.current;if(!v||!enabled)return;
    let timer:ReturnType<typeof setTimeout>|undefined,animation=0,lastPublish=0,alive=true;
    finished.current=false;
    const update=(force=false)=>{
      if(!alive||!v.readyState)return;
      clearTimeout(timer);
      if(!segments.length){v.pause();publish.current(0);return;}
      if(v.seeking)return;
      const last=segments.at(-1)!;
      if(finished.current){publish.current(last.end);return;}
      const target=keptPosition(v.currentTime,segments)!;
      if(target>=last.end){
        finished.current=true;v.pause();
        v.currentTime=Math.max(last.start,last.end-Math.min(frame,(last.end-last.start)/2));
        publish.current(last.end);return;
      }
      if(Math.abs(target-v.currentTime)>.000001){v.currentTime=target;publish.current(target);return;}
      if(force||performance.now()-lastPublish>=80){publish.current(target);lastPublish=performance.now();}
      if(!v.paused){
        const segment=segments.find(s=>target>=s.start&&target<s.end)!;
        // Use the media clock for the boundary, not React's displayed playhead.
        timer=setTimeout(()=>update(true),Math.max(1,(segment.end-target)/v.playbackRate*1000));
      }
    };
    const play=()=>{if(v.paused)return;if(finished.current){finished.current=false;v.currentTime=segments[0]?.start||0;}update(true);};
    const refresh=()=>update(true);
    const loop=()=>{update();animation=requestAnimationFrame(loop);};
    v.addEventListener('play',play);v.addEventListener('seeked',refresh);v.addEventListener('loadedmetadata',refresh);v.addEventListener('ratechange',refresh);v.addEventListener('timeupdate',refresh);
    update(true);animation=requestAnimationFrame(loop);
    return()=>{alive=false;clearTimeout(timer);cancelAnimationFrame(animation);v.removeEventListener('play',play);v.removeEventListener('seeked',refresh);v.removeEventListener('loadedmetadata',refresh);v.removeEventListener('ratechange',refresh);v.removeEventListener('timeupdate',refresh);};
  },[segments,mediaId,frame,player,enabled]);
  return {seek};
}
