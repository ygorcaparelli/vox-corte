import json
from pathlib import Path

out=Path(__file__).resolve().parent.parent/'outputs/linkedin'
info=json.loads((out/'video-final.json').read_text('utf-8'))
record=json.loads((out/'gravacao.json').read_text('utf-8'))
tests=info['tests']
checklist='\n'.join('- Aprovado: '+c['name']+'.' for c in info['checks'])
report=f'''# Vox Corte: demonstração e testes

Versão gravada: {record['version']}. Aplicativo Electron executado no Windows.
O vídeo da demonstração e sua voz são sintéticos, criados especificamente para este teste.
Não foram utilizados vídeos pessoais. A narração da apresentação também é sintética.

## Evidências desta execução

- {tests['frontendTests']} testes de frontend aprovados.
- {tests['backendTests']} testes de backend aprovados.
- {tests['totalTests']} testes automatizados no total.
- Compilação TypeScript verificada sem erros.
- {tests['legacyComparisons']} comparações de intervalos de corte com a versão 1.10.2 aprovadas.
- {len(info['checks'])} verificações no fluxo real do aplicativo, sem simular a transcrição ou a exportação.
- Vídeo fonte: {info['sourceDuration']:.2f} segundos.
- MP4 exportado: {info['exportedDuration']:.2f} segundos, com cortes e zoom aplicados.
- Preservação do arquivo original conferida por SHA-256 antes e depois.
- MP4 final de apresentação: 1920 × 1080, H.264, AAC e 30 fps; decodificação integral sem erros.

## Verificações funcionais

{checklist}

## Como a gravação foi realizada

A interação foi automatizada com Playwright no aplicativo de Windows, usando dados
isolados de demonstração. Os seletores de arquivos foram preenchidos automaticamente;
a importação, transcrição, edição, análise de pausas, salvamento e exportação foram reais.
A transcrição foi processada localmente com o modelo base já disponível.
As esperas de processamento foram abreviadas na edição e identificadas no vídeo.
O caminho local de exportação foi desfocado na apresentação por privacidade.
No antes/depois, o áudio reproduzido vem dos próprios arquivos fonte e exportado.

O MP4 exportado foi transcrito novamente, de forma independente: a frase removida
não foi encontrada e as falas que deveriam permanecer foram reconhecidas.
Essa verificação não substitui escuta humana ou avaliação em diferentes vídeos.

## Limitações

Estes resultados comprovam esta execução e os casos cobertos pelos testes, não
compatibilidade universal com todos os equipamentos, codecs, idiomas ou vozes.
O reconhecimento de fala e o detector de pausas ainda exigem revisão dos cortes.
O funcionamento offline pressupõe que o modelo tenha sido baixado previamente.

Logs brutos disponíveis nesta pasta: frontend.log, backend.log, typescript.log e corte-original.log.
'''
(out/'Relatorio-Testes-VoxCorte.md').write_text(report,'utf-8')
post=f'''Estou desenvolvendo o Vox Corte: um editor de vídeo para Windows em que a fala também vira uma ferramenta de edição.

A ideia é simples: importar um vídeo, transcrever localmente e selecionar palavras para remover os trechos correspondentes de áudio e vídeo. Não é só apagar a legenda: o corte vai para o MP4 exportado.

Na demonstração, mostro o fluxo funcionando:
• Projetos salvos e organizados;
• Transcrição com timestamps por palavra;
• Exclusão de uma frase e desfazer/refazer;
• Revisão de pausas, linha do tempo e zoom;
• Exportação real e comparação antes/depois.

Nesta execução, passaram {tests['totalTests']} testes automatizados e {tests['legacyComparisons']} comparações do algoritmo de corte. Também validei o fluxo no aplicativo, a preservação do arquivo original por SHA-256 e o áudio do arquivo exportado.

Tecnologias: Electron, React, TypeScript, Python, faster-whisper e FFmpeg. Desenvolvimento assistido por IA, com implementação e validação através de testes reais.

O projeto continua evoluindo. A demonstração usa um vídeo de teste com voz sintética, sem dados pessoais e sem API paga para transcrever.

#DesenvolvimentoDeSoftware #InteligenciaArtificial #Electron
'''
(out/'Texto-LinkedIn.txt').write_text(post,'utf-8')
public=dict(version=record['version'],frontendTests=tests['frontendTests'],backendTests=tests['backendTests'],
            totalTests=tests['totalTests'],legacyComparisons=tests['legacyComparisons'],
            checks=[dict(name=c['name'],passed=c['passed']) for c in info['checks']],
            syntheticFixture=True,sourceDuration=info['sourceDuration'],exportedDuration=info['exportedDuration'])
(out/'relatorio-publico.json').write_text(json.dumps(public,ensure_ascii=False,indent=2),'utf-8')
print('Relatorio e sugestao de texto preparados.')
