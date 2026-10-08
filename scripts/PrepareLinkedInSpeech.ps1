param([string]$OutputDir=(Join-Path $PSScriptRoot '..\outputs\linkedin'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice=$speaker.GetInstalledVoices() | Where-Object {$_.VoiceInfo.Culture.Name -eq 'pt-BR'} | Select-Object -First 1
if(!$voice){throw 'Voz sintetica pt-BR nao encontrada.'}
$speaker.SelectVoice($voice.VoiceInfo.Name)
$speaker.Rate=0
try {
  $phrases=@('Olá, este é um teste do Vox Corte.','Eu posso editar o vídeo usando a transcrição.','Este trecho será removido.','O arquivo original continua preservado.')
  for($i=0;$i -lt $phrases.Count;$i++) {
    $speaker.SetOutputToWaveFile((Join-Path $OutputDir "fala-$i.wav"))
    $speaker.Speak($phrases[$i])
    $speaker.SetOutputToNull()
  }
  $narrations=@(
    'Este é o Vox Corte. Um editor de vídeo local, com interface em português.',
    'Os projetos ficam organizados e salvos. Aqui, vou criar uma nova demonstração.',
    'Importo um vídeo de teste com voz sintética. O arquivo original é preservado.',
    'A transcrição é gerada localmente, com identificação e tempo de cada palavra.',
    'Seleciono uma frase e excluo o trecho. Isso remove áudio e vídeo, não apenas o texto.',
    'Desfazer e refazer permitem comparar a edição sem alterar o arquivo original.',
    'A remoção automática de pausas ajusta os intervalos. Todos os cortes podem ser revisados.',
    'Na linha do tempo, posso navegar pelos clipes e ajustar o zoom da visualização.',
    'Também posso aplicar zoom na imagem. A prévia já reproduz a montagem com os cortes.',
    'A exportação gera um arquivo MP4 real. Vou conferir o resultado e a duração.',
    'Agora, compare o trecho original com o resultado exportado.',
    'Além da demonstração, executei testes automatizados de edição, salvamento e processamento.'
  )
  for($i=0;$i -lt $narrations.Count;$i++) {
    $speaker.SetOutputToWaveFile((Join-Path $OutputDir "narracao-$i.wav"))
    $speaker.Speak($narrations[$i])
    $speaker.SetOutputToNull()
  }
} finally {$speaker.Dispose()}
Write-Output "Falas sinteticas preparadas em $OutputDir"
