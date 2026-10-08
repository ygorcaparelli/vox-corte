import {describe,it,expect} from 'vitest';
import {Zoom} from './editor';
import {compileZooms,zoomAt,automaticZooms,validZoom,zoomSettings} from './zoom';
const effect:Zoom={id:'z',start:0,end:4,from:1,to:2,x:.5,y:.5,curve:'linear'};
describe('zoom na imagem',()=>{
  it('frequencia, intensidade e regioes protegidas controlam o automatico',()=>{
    const settings=zoomSettings();
    const quiet=automaticZooms([],600,[],{...settings,frequency:'discreet'});
    const frequent=automaticZooms([],600,[],{...settings,frequency:'frequent',intensity:35});
    expect(frequent.length).toBeGreaterThan(quiet.length);
    expect(frequent[0].from).toBe(1.35);
    const excluded={id:'safe',start:0,end:80,label:''};
    expect(automaticZooms([],180,[],{...settings,excluded:[excluded]}).every(z=>z.start>=80)).toBe(true);
    expect(zoomSettings({...settings,intensity:Infinity}).intensity).toBe(18);
  });
  it('distribui poucos movimentos longos pelo video com pausas em enquadramento normal',()=>{
    const zooms=automaticZooms([],180),compiled=compileZooms(zooms,[],180);
    expect(zooms.length).toBeGreaterThan(3);expect(zooms.length).toBeLessThan(8);
    expect(zooms.slice(0,3).map(z=>z.automaticMotion)).toEqual(['cut-out','slow-in','cut']);
    for(let i=1;i<zooms.length;i++)expect(zooms[i].start-zooms[i-1].end).toBeGreaterThanOrEqual(20);
    expect(zooms.filter(z=>z.from!==z.to).every(z=>z.end-z.start>=12)).toBe(true);
    const [out,into,fixed]=compiled;
    expect(zoomAt(out.start,compiled).scale).toBe(1.18);
    expect(zoomAt(out.end-.001,compiled).scale).toBeCloseTo(1,6);
    expect(zoomAt(into.start,compiled).scale).toBe(1);
    expect(zoomAt(into.end-.001,compiled).scale).toBeCloseTo(1.2,6);
    expect(zoomAt(into.end,compiled).scale).toBe(1);
    expect(zoomAt(fixed.start,compiled).scale).toBe(1.18);
    expect(zoomAt(fixed.end,compiled).scale).toBe(1);
    expect(zoomAt(out.end+5,compiled).scale).toBe(1);
  });
  it('muitos cortes curtos nao disparam zoom em cada frase',()=>{
    const cuts=Array.from({length:100},(_,i)=>({id:String(i),start:i*2+.8,end:i*2+1,label:''}));
    const zooms=compileZooms(automaticZooms(cuts,200),cuts,200);
    expect(zooms.length).toBeLessThan(8);
    expect(zooms.some(z=>z.start>120)).toBe(true);
    expect(zooms[0].end-zooms[0].start).toBeCloseTo(12);
  });
  it('videos muito curtos nao recebem zoom e manuais nao sao sobrescritos',()=>{
    expect(automaticZooms([],3)).toEqual([]);
    const manual={...effect,start:8,end:25};
    const zooms=automaticZooms([],180,[manual]);
    expect(zooms.find(z=>z.id===manual.id)).toEqual(manual);
    expect(zooms.filter(z=>z.automatic).every(z=>z.end<=manual.start||z.start>=manual.end)).toBe(true);
  });
  it('automatico entra e sai sem salto, preservando os movimentos manuais',()=>{
    const automatic={...effect,automatic:true,from:1.2,to:1.3};
    expect(zoomAt(0,[automatic]).scale).toBe(1);
    expect(zoomAt(3.99999,[automatic]).scale).toBeCloseTo(1,7);
    expect(zoomAt(2,[automatic]).scale).toBe(1.25);
    expect(zoomAt(0,[{...automatic,automatic:false}]).scale).toBe(1.2);
  });
  it('interpela e volta ao tamanho original fora do intervalo',()=>{expect(zoomAt(2,[effect]).scale).toBe(1.5);expect(zoomAt(4,[effect]).scale).toBe(1);expect(zoomAt(-1,[effect]).scale).toBe(1);});
  it('conta apenas tempo mantido depois dos cortes',()=>{const z=compileZooms([effect],[{id:'c',start:1,end:3,label:''}],5);expect(z[0].end).toBe(2);expect(zoomAt(1,z).scale).toBe(1.5);});
  it('rejeita escalas e tempos invalidos',()=>{expect(validZoom({...effect,to:Infinity})).toBe(false);expect(validZoom({...effect,x:2})).toBe(false);expect(validZoom({...effect,end:0})).toBe(false);});
  it('automatico preserva manual e nao acumula efeitos ao repetir',()=>{const first=automaticZooms([],40,[effect]);const next=automaticZooms([],40,first);expect(next.length).toBe(first.length);expect(next.find(z=>z.id==='z')).toEqual(effect);expect(next.filter(z=>z.automatic).every(z=>z.start>=4)).toBe(true);});
});
