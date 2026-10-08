import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import TaskLoading from './TaskLoading';
describe('task loading',()=>{
  it('reports actual progress and clamps out-of-range values',()=>{
    const html=renderToStaticMarkup(<TaskLoading title="Importando" message="Transferindo" progress={.45}/>);
    expect(html).toContain('aria-valuenow="45"');
    expect(html).toContain('width:45%');
    expect(renderToStaticMarkup(<TaskLoading title="Test" message="Test" progress={2}/>)).toContain('aria-valuenow="100"');
  });
  it('does not invent a percentage for unknown progress',()=>{
    const html=renderToStaticMarkup(<TaskLoading title="Importando" message="Verificando" progress={null} phase="verify"/>);
    expect(html).toContain('loading-indeterminate');
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('aria-current="step"');
  });
  it('preserves cancel availability and escapes file names',()=>{
    const html=renderToStaticMarkup(<TaskLoading title="Importando" message="Test" progress={0} filename="<video>.mp4" onCancel={()=>{}} cancelDisabled cancelLabel="Cancelar importação"/>);
    expect(html).toContain('&lt;video&gt;.mp4');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Cancelar importação');
  });
});
