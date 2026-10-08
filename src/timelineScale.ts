export function timelineScale(width:number,duration:number,fps:number,requested:number|null){
  const fit=Math.max(1,width)/Math.max(duration,.1);
  const maximum=Math.max(fit,Math.min(Math.max(960,fps*12),16000000/Math.max(duration,.1)));
  const scale=requested===null?fit:Math.max(fit,Math.min(maximum,requested));
  return {fit,maximum,scale};
}

export function scaleToSlider(scale:number,fit:number,maximum:number){
  return maximum<=fit?0:Math.max(0,Math.min(100,100*Math.log(scale/fit)/Math.log(maximum/fit)));
}

export function sliderToScale(value:number,fit:number,maximum:number){
  return fit*(maximum/fit)**(Math.max(0,Math.min(100,value))/100);
}
