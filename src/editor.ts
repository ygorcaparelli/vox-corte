export type Word = { id: string; text: string; start: number; end: number; paragraph: number };
export type Cut = { id: string; start: number; end: number; label: string; automatic?:boolean };
export function replaceAutomaticCuts(existing:Cut[], detected:Cut[]):Cut[]{
  return [...existing.filter(c=>!c.automatic&&c.label!=='Corte seco entre falas'),...detected.map(c=>({...c,automatic:true}))];
}
export type Zoom = {id:string;start:number;end:number;from:number;to:number;x:number;y:number;curve:'linear'|'smooth';automatic?:boolean;automaticMotion?:'cut-out'|'slow-in'|'cut'};
export type ZoomSettings={frequency:'discreet'|'balanced'|'frequent';intensity:number;excluded:Cut[]};
export type Edit = { words: Word[]; cuts: Cut[]; splits?: number[]; zooms?:Zoom[];zoomSettings?:ZoomSettings };
export function validRange(start: number|null, end: number|null, duration: number): boolean {
  return start !== null && end !== null && Number.isFinite(start + end) && start >= 0 && end > start && end <= duration;
}
export function mergeCuts(cuts: Cut[], duration: number): Cut[] {
  const merged: Cut[] = [];
  for (const cut of [...cuts].sort((a,b) => a.start-b.start)) {
    const start = Math.max(0, cut.start), end = Math.min(duration, cut.end);
    if (!Number.isFinite(start + end) || end <= start) continue;
    const last = merged.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ ...cut, start, end });
  }
  return merged;
}
export function deleted(word: Word, cuts: Cut[]) { return cuts.some(c => word.start < c.end && word.end > c.start); }
export function keptSegments(cuts: Cut[], duration: number, splits: number[] = []) {
  const result: {start:number;end:number;editedStart:number;editedEnd:number}[] = [];
  let cursor = 0, edited = 0;
  for (const cut of [...mergeCuts(cuts,duration),{start:duration,end:duration}]) {
    if(cut.start>cursor) {
      const boundaries=[cursor,...[...new Set(splits)].filter(t=>Number.isFinite(t)&&t>cursor&&t<cut.start).sort((a,b)=>a-b),cut.start];
      for(let i=1;i<boundaries.length;i++){const start=boundaries[i-1],end=boundaries[i],length=end-start;result.push({start,end,editedStart:edited,editedEnd:edited+length});edited+=length;}
    }
    cursor=cut.end;
  }
  return result;
}
export function originalToEdited(time: number, cuts: Cut[], duration: number) {
  const segments=keptSegments(cuts,duration);
  for(const s of segments) {if(time<s.start)return s.editedStart;if(time<=s.end)return s.editedStart+Math.max(0,time-s.start);}
  return segments.at(-1)?.editedEnd||0;
}
export function editedToOriginal(time: number, cuts: Cut[], duration: number) {
  const segments=keptSegments(cuts,duration);
  for(const s of segments) {if(time<s.editedEnd)return s.start+Math.max(0,time-s.editedStart);}
  return segments.at(-1)?.end||0;
}
export function selectionCuts(words: Word[], ids: string[]): Cut[] {
  const selected = new Set(ids);
  const runs: Word[][] = [];
  let run: Word[] = [];
  for (const word of words) {
    if (selected.has(word.id)) run.push(word);
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.map(r => ({ id: crypto.randomUUID(), start: r[0].start, end: r.at(-1)!.end, label: r.map(w => w.text).join(' ') }));
}
export function restoreIntervals(cuts: Cut[], ranges: Cut[]): Cut[] {
  let result = cuts;
  for (const range of ranges) result = result.flatMap(c => {
    if (c.end <= range.start || c.start >= range.end) return [c];
    const remaining: Cut[] = [];
    if (c.start < range.start) remaining.push({ ...c, end: range.start });
    if (c.end > range.end) remaining.push({ ...c, id: crypto.randomUUID(), start: range.end });
    return remaining;
  });
  return result;
}
export function trimBoundary(cuts: Cut[], duration: number, index: number, edge: 'start'|'end', target: number, splits: number[] = []) {
  const segments = keptSegments(cuts,duration,splits), segment = segments[index];
  if(!segment||!Number.isFinite(target))return undefined;
  const minimumLength=Math.min(.05,segment.end-segment.start);
  const minimum = edge==='start' ? segments[index-1]?.end||0 : segment.start+minimumLength;
  const maximum = edge==='start' ? segment.end-minimumLength : segments[index+1]?.start??duration;
  return Math.max(minimum,Math.min(maximum,Math.round(target*1000)/1000));
}
export function trimSegment(cuts: Cut[], duration: number, index: number, edge: 'start'|'end', target: number, splits: number[] = []): Cut[] {
  const value=trimBoundary(cuts,duration,index,edge,target,splits);
  if(value===undefined)return cuts;
  const boundary=keptSegments(cuts,duration,splits)[index][edge];
  if(Math.abs(value-boundary)<.001)return cuts;
  const interval = {id:crypto.randomUUID(),start:Math.min(boundary,value),end:Math.max(boundary,value),label:'Ajuste do clipe'};
  const recovering = edge==='start' ? value<boundary : value>boundary;
  return recovering ? restoreIntervals(cuts,[interval]) : [...cuts,interval];
}
