const ready=(page,duration)=>page.waitForFunction(d=>{const v=document.querySelector('video'),c=document.querySelector('.smooth-preview'),bar=document.querySelector('.player-position');const loaded=c?c.dataset.ready==='true'&&c.dataset.seeking==='false':v&&v.readyState>=2&&!v.seeking&&!v.classList.contains('pending-video');return loaded&&!document.querySelector('.job')&&bar&&!bar.disabled&&(d===undefined||Math.abs(Number(bar.max)-d)<.12);},duration,{timeout:60000});
async function seekPreview(page,time){
 await page.locator('.player-position').evaluate((bar,t)=>{
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(bar,String(t));
  bar.dispatchEvent(new Event('input',{bubbles:true}));bar.dispatchEvent(new Event('change',{bubbles:true}));
 },time);
 await page.waitForFunction(t=>{const v=document.querySelector('video'),c=document.querySelector('.smooth-preview'),bar=document.querySelector('.player-position');return (c?c.dataset.ready==='true'&&c.dataset.seeking==='false':v.readyState>=2&&!v.seeking)&&Math.abs(Number(bar.value)-t)<.07;},time);
}
module.exports={ready,seekPreview};
