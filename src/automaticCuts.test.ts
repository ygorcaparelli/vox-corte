import {expect,it} from 'vitest';
import {replaceAutomaticCuts} from './editor';
it('replaces old automatic cuts while retaining manual and transcript cuts',()=>{
  const old=[{id:'manual',start:1,end:2,label:'Corte manual'},
    {id:'old',start:3,end:4,label:'Corte seco entre falas'},
    {id:'auto',start:5,end:6,label:'Pausa',automatic:true},
    {id:'word',start:7,end:8,label:'Palavra'}];
  const detected=[{id:'new',start:3.3,end:3.7,label:'Corte seco entre falas'}];
  const next=replaceAutomaticCuts(old,detected);
  expect(next.map(c=>c.id)).toEqual(['manual','word','new']);
  expect(old).toHaveLength(4);
  expect(replaceAutomaticCuts(next,[]).map(c=>c.id)).toEqual(['manual','word']);
});
