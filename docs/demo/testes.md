# Vox Corte: demonstração e testes

Versão gravada: 1.12.2. Aplicativo Electron executado no Windows.
O vídeo da demonstração e sua voz são sintéticos, criados especificamente para este teste.
Não foram utilizados vídeos pessoais. A narração da apresentação também é sintética.

## Evidências desta execução

- 41 testes de frontend aprovados.
- 35 testes de backend aprovados.
- 76 testes automatizados no total.
- Compilação TypeScript verificada sem erros.
- 200 comparações de intervalos de corte com a versão 1.10.2 aprovadas.
- 10 verificações no fluxo real do aplicativo, sem simular a transcrição ou a exportação.
- Vídeo fonte: 20.96 segundos.
- MP4 exportado: 10.61 segundos, com cortes e zoom aplicados.
- Preservação do arquivo original conferida por SHA-256 antes e depois.
- MP4 final de apresentação: 1920 × 1080, H.264, AAC e 30 fps; decodificação integral sem erros.

## Verificações funcionais

- Aprovado: Aplicativo Windows abre.
- Aprovado: Importação e prévia carregam.
- Aprovado: Transcrição real produz palavras e timestamps.
- Aprovado: Excluir frase reduz a duração do vídeo.
- Aprovado: Desfazer e refazer restauram as durações.
- Aprovado: Exportação MP4 existe.
- Aprovado: Arquivo original inalterado.
- Aprovado: Projeto aparece na biblioteca após salvar.
- Aprovado: Interface sem erros de execução.
- Aprovado: Transcrição independente do MP4 confirma remoção da frase e manutenção das outras falas.

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
