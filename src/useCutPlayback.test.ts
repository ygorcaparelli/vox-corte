import {describe,expect,it} from 'vitest';
import {keptPosition} from './useCutPlayback';
import {keptSegments} from './editor';
describe('posicionamento da previa imediata',()=>{
  const segments=keptSegments([{id:'c',start:2,end:4,label:'corte'},{id:'tail',start:5,end:6,label:'fim'}],6);
  it('preserva a fala e pula o corte sem apontar para o fim',()=>{expect(keptPosition(1,segments)).toBe(1);expect(keptPosition(2,segments)).toBe(4);expect(keptPosition(3,segments)).toBe(4);expect(keptPosition(4.5,segments)).toBe(4.5);});
  it('limita o fim e respeita cortes iniciais e totais',()=>{expect(keptPosition(6,segments)).toBe(5);expect(keptPosition(0,keptSegments([{id:'c',start:0,end:1,label:''}],6))).toBe(1);expect(keptPosition(0,[])).toBeNull();});
});
