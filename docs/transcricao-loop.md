# Loop de transcrição ("o que é que é que é que…")

## Sintoma

Ocasionalmente a transcrição devolve a mesma expressão repetida dezenas de vezes. O texto entrava
inteiro na legenda e na fila, e o avatar passava minutos sinalizando a repetição.

## Investigação

- **Servidor local (speaches).** O `openapi.json` mostra `temperature` com padrão `0.0` (um único
  número) e `vad_filter` com padrão `false`. Com temperatura fixa, o faster-whisper não usa o
  fallback de temperatura (0,0 → 0,2 → … guiado pela taxa de compressão), que é a proteção do
  próprio Whisper contra decodificação em loop.
- **Pipeline do Sinalize.** Os parciais retranscrevem o áudio acumulado do segmento a cada ~300 ms,
  cortado no meio da palavra; segmentos longos são cortados em 12 s mesmo com fala em andamento.
  Áudio truncado e ruído são os gatilhos clássicos do loop.
- **Reprodução.** Áudio sintético (TTS pt-BR) com ruído, zumbido, corte no meio da palavra e frase
  repetida não reproduziu o loop no `faster-whisper-small`. Dois achados laterais: ligar
  `vad_filter` *piorou* um caso com ruído ("por aqui e aqui."), e o modelo colapsou uma frase dita
  4 vezes em uma — portanto parâmetro de servidor não resolve e repetição natural precisa ser
  preservada pelo cliente.
- **Duplicações.** Não havia proteção contra um mesmo segmento entrar duas vezes na legenda/fila, nem
  contra parciais fora de ordem sobrescreverem o texto final.

## Correção

| Camada | Arquivo | O que faz |
|---|---|---|
| Detecção | `features/transcription/segment-guard.ts` | Séries de n-gramas (1–8 palavras) repetidos em sequência acima do limite (6× para palavra única, 4× para 2–3 palavras, 3× para 4+) e taxa de fala acima de 6 palavras/s para a duração do áudio. Compara sem acentos e pontuação. |
| Recuperação | `features/session/recorder.ts` | Final com loop: nova transcrição com `temperature = 0.4` (reproduz o fallback que o servidor desliga). Se ainda houver loop, só a série anômala é colapsada para uma ocorrência; o resto do texto fica. Parciais com loop são exibidos já colapsados. |
| Revisões | `features/transcription/transcript-store.ts` | Cada parcial tem número de revisão; revisões antigas e parciais após o final são descartados. |
| Idempotência | `transcript-store.ts`, `features/session/session.ts`, `signing-queue.ts` | Um segmento é consolidado uma única vez; um final repetido não chega à legenda nem à fila; a fila ignora segmento já enfileirado. |
| Proteção da fila | `features/translation/signing-queue.ts` | Segmentos acima de 80 palavras são truncados (registrado como `queue.truncated`). |
| Limite visual | `features/captions/caption-store.ts` | Cada frase da legenda é limitada a 280 caracteres (mantém o final). |
| Diagnóstico | telemetria | Eventos `asr.loop`, `asr.recovered`, `asr.repaired`, `final.duplicate`, `queue.duplicate`; contador "Loops do ASR" no módulo Diagnóstico; selo "LOOP CORRIGIDO" no console de transcrição. |

## Regressão

`segment-guard.test.ts` cobre o texto relatado, loops no meio da frase, pontuação/acentos, taxa de
fala impossível e cinco repetições naturais que **não** podem ser alteradas ("Não, não, não…",
"Vamos lá, vamos lá, vamos lá!", "É que é que eu não sabia." etc.). `session.test.ts` cobre
revisões fora de ordem, final duplicado e a idempotência da fila.
