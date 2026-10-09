# Publicação do Vox Corte

## Site

Site estático em `docs/index.html`, `docs/styles.css`, `docs/site.js` e `docs/assets/`.
Não precisa de servidor de aplicação, banco de dados, conta ou variáveis secretas.
Abra `docs/index.html` para visualizar localmente. O botão de copiar hash requer
HTTPS ou localhost; há fallback com seleção manual e download do arquivo.

No GitHub: Settings → Pages → Deploy from a branch → `main` → `/docs`.
URL esperada: https://ygorcaparelli.github.io/vox-corte/.
O site não altera o aplicativo desktop e não processa vídeos no navegador.

Para os testes visuais, instale o navegador de teste uma vez com
`npx playwright install chromium` e execute `node scripts/test_download_site.cjs`.
O teste inicia e encerra seu próprio servidor temporário. `--live` verifica o
site publicado. Capturas e resultados ficam em `outputs/site-qa`, fora do Git.

## Instalador

Instaladores ficam nos **Assets de uma GitHub Release**, nunca no histórico Git.
A versão 1.12.2 usa a tag `v1.12.2` e o arquivo `Vox-Corte-Instalar-1.12.2.exe`.
O SHA-256 fica em `docs/downloads/SHA256SUMS.txt` e na mesma release.

Ao atualizar:

1. Compile, teste e confira a versão dentro do pacote, não somente no nome do EXE.
2. Calcule o SHA-256 do instalador final.
3. Crie uma nova release e envie o EXE e o arquivo de verificação.
4. Atualize versão, tamanho, URL e hash em `docs/index.html`, no README e no SHA256SUMS.
5. Execute `node scripts/test_download_site.cjs` e confira desktop e celular.
6. Faça commit e push. O GitHub Pages publica a pasta `docs` automaticamente.

Não substitua silenciosamente um instalador já publicado. Gere uma nova versão
se o binário mudar. Não coloque vídeos pessoais, tokens, modelos ou caches no Git.

## Assets e Dependências

Logos são as do Vox Corte já utilizadas no aplicativo. Capturas vêm da execução
real com mídia sintética de teste, sem vídeos pessoais. A demonstração foi criada
para este projeto, com narração sintética. Os ícones são gerados de `lucide-react`,
a dependência já utilizada pelo editor, por `node scripts/build_site_icons.cjs`.
O site não usa CDN, analytics, fontes remotas nem dependências em runtime.

## Movimento e Interação

A abertura usa `assets/editor-reel.mp4`, um loop silencioso de 12 segundos,
1280 × 720, gerado das cenas demonstrativas por `scripts/build_site_reel.py`.
O script usa o FFmpeg já disponível no ambiente do aplicativo; os arquivos
de origem ficam em `outputs/linkedin`, fora do Git. O MP4 final fica no site.

As animações usam CSS e APIs nativas do navegador. O controle no cabeçalho
pausa o movimento e guarda a preferência apenas no próprio navegador.
Com movimento reduzido no sistema, o vídeo de fundo nem é carregado.
Vídeo e exemplos automáticos pausam quando saem da tela ou a aba fica oculta.
O vídeo com narração só reproduz mediante ação do visitante.

O exemplo de palavras é uma simulação identificada, sem upload ou processamento
de mídia. Depois de uma alteração manual, a animação não desfaz a escolha do
visitante. As capturas ampliadas mostram o aplicativo real. Os testes cobrem
interação, teclado, redução de movimento, mídia, links e seis tamanhos de tela.
