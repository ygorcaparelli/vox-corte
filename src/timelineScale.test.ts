import {describe,it,expect} from 'vitest';
import {timelineScale,scaleToSlider,sliderToScale} from './timelineScale';

describe('timeline scale',()=>{
  it('starts long videos at a useful fixed scale',()=>{
    expect(timelineScale(1000,780,60,48).scale).toBe(48);
    expect(timelineScale(1000,3600,60,48).scale).toBe(48);
  });
  it('can show individual frames on long videos',()=>{
    const {scale}=timelineScale(1000,3600,60,Infinity);
    expect(scale/60).toBeGreaterThanOrEqual(12);
  });
  it('fits short videos and supports fit mode',()=>{
    expect(timelineScale(1000,6,30,48).scale).toBeCloseTo(1000/6);
    expect(timelineScale(1000,3600,60,null).scale).toBeCloseTo(1000/3600);
  });
  it('maps the logarithmic slider back to actual scale',()=>{
    const {fit,maximum}=timelineScale(1000,780,60,48);
    expect(sliderToScale(scaleToSlider(48,fit,maximum),fit,maximum)).toBeCloseTo(48);
    expect(sliderToScale(0,fit,maximum)).toBe(fit);
    expect(sliderToScale(100,fit,maximum)).toBeCloseTo(maximum);
  });
  it('bounds canvas width for unusually long recordings',()=>{
    const {maximum}=timelineScale(1000,86400,120,48);
    expect(maximum*86400).toBeLessThanOrEqual(16000000);
  });
  it('handles empty timelines without NaN',()=>{
    const {scale,fit,maximum}=timelineScale(800,0,30,48);
    expect(Number.isFinite(scale)).toBe(true);
    expect(scaleToSlider(scale,fit,maximum)).toBe(0);
  });
});
