import {describe,it,expect} from 'vitest';
import {cutAudition} from './cutAudition';
const cut={id:'cut',start:2,end:4,label:''};
describe('revisao de cortes',()=>{
  it('original inclui contexto e editada pula todos os cortes vizinhos',()=>{
    expect(cutAudition(cut,[cut],6,false)).toEqual([{start:1.2,end:4.8}]);
    expect(cutAudition(cut,[cut,{id:'neighbor',start:4.5,end:5,label:''}],6,true)).toEqual([{start:1.2,end:2},{start:4,end:4.5}]);
  });
  it('limita nas bordas e nao toca video totalmente excluido',()=>{
    expect(cutAudition({...cut,start:0,end:6},[{...cut,start:0,end:6}],6,true)).toEqual([]);
    expect(cutAudition({...cut,start:0,end:1},[],6,false)).toEqual([{start:0,end:1.8}]);
  });
});
