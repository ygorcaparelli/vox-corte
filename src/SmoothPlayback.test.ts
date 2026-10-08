import {describe,it,expect} from 'vitest';
import {audioSlice,previewFrames} from './SmoothPlayback';
import {keptSegments} from './editor';
describe('audio nas juncoes',()=>{
  it('limita amostras que cruzam as duas bordas de um trecho',()=>{expect(audioSlice(1.98,.04,2,2.01)).toEqual({start:2,offset:2-1.98,duration:2.01-2});});
  it('nao agenda audio excluido nem buffers vazios',()=>{expect(audioSlice(2,.02,4,5)).toBeNull();expect(audioSlice(4,.02,2,4)).toBeNull();});
});
describe('leitura continua da montagem',()=>{
  it('nao pede quadros apagados e limita a previa de 60 a 30 fps',()=>{
    const frames=[...previewFrames(keptSegments([{id:'cut',start:1,end:4,label:''}],5),0,60)];
    expect(frames).toHaveLength(60);
    expect(frames.every(f=>f.original<1||f.original>=4)).toBe(true);
    expect(frames[30].at).toBe(1);expect(frames[30].original).toBe(4);
  });
  it('inclui clipes menores que um quadro e busca dentro do intervalo',()=>{
    const frames=[...previewFrames(keptSegments([{id:'cut',start:.01,end:1,label:''}],1.02),.005,30)];
    expect(frames).toHaveLength(2);expect(frames[0].original).toBe(.005);
    expect(frames[0].end).toBe(.01);expect(frames[1].original).toBe(1);
  });
});
