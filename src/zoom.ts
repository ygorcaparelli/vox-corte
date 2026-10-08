import {Cut,Zoom,ZoomSettings,keptSegments,originalToEdited,editedToOriginal} from './editor';
export function zoomSettings(value?:ZoomSettings):ZoomSettings{
  return {frequency:value&&['discreet','balanced','frequent'].includes(value.frequency)?value.frequency:'balanced',
    intensity:Number.isFinite(value?.intensity)?Math.max(5,Math.min(40,value!.intensity)):18,
    excluded:Array.isArray(value?.excluded)?value.excluded.filter(c=>Number.isFinite(c.start+c.end)&&c.start>=0&&c.end>c.start):[]};
}
export function validZoom(z:Zoom){return !!z&&typeof z.id==='string'&&[z.start,z.end,z.from,z.to,z.x,z.y].every(Number.isFinite)&&z.start>=0&&z.end>z.start&&z.from>=1&&z.from<=3&&z.to>=1&&z.to<=3&&z.x>=0&&z.x<=1&&z.y>=0&&z.y<=1&&['linear','smooth'].includes(z.curve)&&(z.automaticMotion===undefined||['cut-out','slow-in','cut'].includes(z.automaticMotion));}
export function compileZooms(zooms:Zoom[],cuts:Cut[],duration:number){
  return zooms.filter(validZoom).map(z=>({...z,start:originalToEdited(z.start,cuts,duration),end:originalToEdited(z.end,cuts,duration)})).filter(z=>z.end>z.start);
}
export function zoomAt(time:number,zooms:Zoom[]){
  const z=zooms.find(z=>time>=z.start&&time<z.end);if(!z)return {scale:1,x:.5,y:.5};
  let progress=Math.max(0,Math.min(1,(time-z.start)/(z.end-z.start)));
  if(z.curve==='smooth')progress=progress*progress*(3-2*progress);
  let scale=z.from+(z.to-z.from)*progress;
  if(z.automatic&&!z.automaticMotion){
    const ramp=Math.min(.35,(z.end-z.start)/4);
    const smooth=(p:number)=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
    scale=1+(scale-1)*smooth((time-z.start)/ramp)*smooth((z.end-time)/ramp);
  }
  return {scale,x:z.x,y:z.y};
}
export function automaticZooms(cuts:Cut[],duration:number,existing:Zoom[]=[],options?:ZoomSettings){
  const manual=existing.filter(z=>!z.automatic),result=[...manual];
  const settings=zoomSettings(options),gap={discreet:1.6,balanced:1,frequent:.6}[settings.frequency];
  const close=1+settings.intensity/100;
  const length=keptSegments(cuts,duration).at(-1)?.editedEnd||0;
  if(length<4)return result;
  const motions:Zoom['automaticMotion'][]=['cut-out','slow-in','cut'];
  let index=0;
  // Schedule on the assembled timeline, so hundreds of short speech cuts do not
  // restart the pattern and create a zoom on every phrase.
  for(let at=Math.min(8,length*.15);at<length-2&&result.length<500;){
    const mode=index%3,seconds=Math.min([12,14,5][mode],length*.35);
    const until=Math.min(at+seconds,length-.5);
    if(until-at<2)break;
    const start=editedToOriginal(at,cuts,duration),end=editedToOriginal(until,cuts,duration);
    if(![...manual,...settings.excluded].some(z=>start<z.end&&end>z.start)){
      result.push({id:crypto.randomUUID(),start,end,from:mode===1?1:close,
        to:mode===0?1:mode===1?Math.min(1.4,close+.02):close,x:.5,y:.5,curve:'smooth',
        automatic:true,automaticMotion:motions[mode]});
      index++;
    }
    at=until+[22,20,26][mode]*gap;
  }
  return result.sort((a,b)=>a.start-b.start);
}
