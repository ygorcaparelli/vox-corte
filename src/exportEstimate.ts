export function exportEstimate(duration:number|undefined,progress:number,speed:string|undefined){
  if(!duration||!speed||progress<=0||progress>=.99)return null;
  const rate=Number(speed.trim().replace(/x$/,''));
  if(!Number.isFinite(rate)||rate<=0)return null;
  const seconds=duration*(1-progress)/rate;
  if(seconds<60)return 'Menos de 1 minuto restante';
  const minutes=Math.ceil(seconds/60);
  return `Aproximadamente ${minutes>=60?`${Math.floor(minutes/60)} h e ${minutes%60} min`:`${minutes} min`} restantes`;
}
