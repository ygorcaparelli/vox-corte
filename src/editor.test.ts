import { describe, expect, it } from 'vitest';
import { deleted, mergeCuts, restoreIntervals, selectionCuts, validRange, originalToEdited, editedToOriginal, trimSegment, keptSegments, Word, Cut } from './editor';
const words: Word[] = ['um','dois','três','quatro'].map((text,i)=>({id:String(i),text,start:i,end:i+.8,paragraph:0}));
const cut: Cut = {id:'c',start:0,end:4,label:'frase'};
describe('edição não destrutiva',()=>{
  it('divide os clipes sem remover imagem ou audio nem alterar a duracao',()=>{
    expect(keptSegments([],6,[2,4,2,NaN,-1,9]).map(s=>[s.start,s.end,s.editedStart,s.editedEnd])).toEqual([[0,2,0,2],[2,4,2,4],[4,6,4,6]]);
    const cuts=[{...cut,start:2,end:4}];
    expect(keptSegments(cuts,6,[1,3,5]).map(s=>[s.start,s.end,s.editedStart])).toEqual([[0,1,0],[1,2,1],[4,5,2],[5,6,3]]);
  });
  it('ajusta um clipe dividido sem cortar o vizinho e restaura a borda',()=>{
    const cuts=trimSegment([],6,1,'start',3,[2,4]);
    expect(mergeCuts(cuts,6).map(c=>[c.start,c.end])).toEqual([[2,3]]);
    expect(trimSegment(cuts,6,1,'start',2,[2,4])).toEqual([]);
    expect(trimSegment([],6,1,'start',-9,[2,4])).toEqual([]);
  });
  it('nao expande automaticamente clipes menores que 50 ms',()=>{
    const original=[{...cut,start:.02,end:1}];
    expect(trimSegment(original,2,0,'end',-1)).toBe(original);
  });
  it('recupera o final e o inicio de clipes sem alterar os cortes originais',()=>{
    const original=[{...cut,start:2,end:4}];
    expect(mergeCuts(trimSegment(original,6,0,'end',3),6).map(c=>[c.start,c.end])).toEqual([[3,4]]);
    expect(mergeCuts(trimSegment(original,6,1,'start',3),6).map(c=>[c.start,c.end])).toEqual([[2,3]]);
    expect(original[0]).toMatchObject({start:2,end:4});
  });
  it('encurta clipes e limita recuperacao para nao sobrepor clipes vizinhos',()=>{
    const original=[{...cut,start:2,end:4}];
    expect(mergeCuts(trimSegment(original,6,0,'end',1),6).map(c=>[c.start,c.end])).toEqual([[1,4]]);
    expect(mergeCuts(trimSegment(original,6,1,'start',5),6).map(c=>[c.start,c.end])).toEqual([[2,5]]);
    expect(trimSegment(original,6,0,'end',99)).toEqual([]);
    expect(trimSegment(original,6,1,'start',-99)).toEqual([]);
    expect(mergeCuts(trimSegment(original,6,0,'end',-99),6)[0].start).toBe(.05);
  });
  it('restaura atraves de cortes sobrepostos e preserva o restante',()=>{
    const original=[{...cut,start:2,end:3.5},{...cut,id:'overlap',start:3,end:4}];
    expect(mergeCuts(trimSegment(original,6,0,'end',3.2),6).map(c=>[c.start,c.end])).toEqual([[3.2,4]]);
    expect(trimSegment(original,6,99,'end',1)).toBe(original);
    expect(trimSegment(original,6,0,'end',NaN)).toBe(original);
  });
  it('mapeia a barra editada sem saltar para o fim ao buscar um corte',()=>{
    const cuts=[{...cut,start:2,end:4}];
    expect(originalToEdited(3,cuts,6)).toBe(2);
    expect(editedToOriginal(2,cuts,6)).toBe(4);
    expect(editedToOriginal(2.5,cuts,6)).toBe(4.5);
    expect(originalToEdited(5,cuts,6)).toBe(3);
    expect(editedToOriginal(4,cuts,6)).toBe(6);
  });
  it('mapeia cortes nas pontas e intervalos sobrepostos',()=>{
    const cuts=[{...cut,start:0,end:1},{...cut,start:2,end:3},{...cut,start:2.5,end:4},{...cut,start:5,end:6}];
    expect(editedToOriginal(0,cuts,6)).toBe(1);
    expect(editedToOriginal(1,cuts,6)).toBe(4);
    expect(originalToEdited(3,cuts,6)).toBe(1);
    expect(originalToEdited(6,cuts,6)).toBe(2);
  });
  it('não permite corte manual vazio, invertido ou fora do vídeo',()=>{
    expect(validRange(null,null,6)).toBe(false);
    expect(validRange(1,1,6)).toBe(false);
    expect(validRange(3,1,6)).toBe(false);
    expect(validRange(-1,2,6)).toBe(false);
    expect(validRange(0,7,6)).toBe(false);
    expect(validRange(1,2,6)).toBe(true);
  });
  it('mantém espaços não selecionados em seleções separadas',()=>{
    const cuts=selectionCuts(words,['0','2']);
    expect(cuts.map(c=>[c.start,c.end])).toEqual([[0,.8],[2,2.8]]);
    expect(deleted(words[1],cuts)).toBe(false);
  });
  it('restaura uma palavra dentro de um corte de frase',()=>{
    const cuts=restoreIntervals([cut],selectionCuts(words,['1']));
    expect(cuts.map(c=>[c.start,c.end])).toEqual([[0,1],[1.8,4]]);
    expect(deleted(words[1],cuts)).toBe(false);
    expect(deleted(words[0],cuts)).toBe(true);
  });
  it('une sobreposições sem alterar os cortes de origem',()=>{
    const original=[cut,{...cut,id:'b',start:2,end:6}];
    expect(mergeCuts(original,5).map(c=>[c.start,c.end])).toEqual([[0,5]]);
    expect(original[0].end).toBe(4);
  });
});
