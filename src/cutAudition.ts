import {Cut,keptSegments} from './editor';
export function cutAudition(cut:Cut,cuts:Cut[],duration:number,edited:boolean){
  const start=Math.max(0,cut.start-.8),end=Math.min(duration,cut.end+.8);
  if(!edited)return [{start,end}];
  return keptSegments(cuts,duration).map(s=>({start:Math.max(start,s.start),end:Math.min(end,s.end)})).filter(s=>s.end>s.start);
}
