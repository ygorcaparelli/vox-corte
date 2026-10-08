import {describe,it,expect} from 'vitest';
import {exportEstimate} from './exportEstimate';
describe('estimativa de exportacao',()=>{
  it('calcula restante pelo tempo editado e velocidade real',()=>{
    expect(exportEstimate(1586.1,.11,'0.765x')).toBe('Aproximadamente 31 min restantes');
    expect(exportEstimate(600,.5,'2x')).toBe('Aproximadamente 3 min restantes');
    expect(exportEstimate(600,.98,'1x')).toBe('Menos de 1 minuto restante');
  });
  it('nao inventa estimativas na inicializacao ou finalizacao',()=>{
    for(const speed of ['N/A','0x','-1x','Infinityx',undefined])expect(exportEstimate(600,.1,speed)).toBeNull();
    expect(exportEstimate(600,0,'1x')).toBeNull();
    expect(exportEstimate(600,.99,'1x')).toBeNull();
  });
});
