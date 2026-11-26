# Modo Overlay — avatar e legendas flutuantes

Terceiro modo do Sinalize (além do Studio e do Telão): o avatar de Libras e as legendas flutuam sobre
qualquer aplicativo (PowerPoint, navegador, PDF, reuniões), compartilhando a mesma sessão de captura,
transcrição e fila de sinalização.

## 1. Investigação: transparência do player VLibras

**Versão analisada:** `vlibras-plugin.js` 7.12.2 → `vlibras-portal@v7.12.3` (jsDelivr) → player Unity
WebGL em `https://vlibras.gov.br/app/unity/index.html?v=7.12.2` (UnityLoader legado, `playerweb.json`).

### Camadas encontradas

| Camada | O que renderiza | Transparente? |
|---|---|---|
| Widget (Preact, em shadow DOM) | painel com cabeçalho "VLibras", rodapé de controles, botão "Pular", fundo `#F8F8F8` | **não** — é a origem do fundo cinza |
| `iframe` do player (cross-origin, `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`) | documento do Unity | sim |
| `#gameContainer` | `background-color: transparent !important` (definido pelo próprio VLibras) | sim |
| Canvas WebGL | contexto WebGL 1.0 com `alpha: true`, `premultipliedAlpha: false`, `preserveDrawingBuffer: false` | sim |
| Cena Unity (câmera) | limpa o framebuffer com **alpha 0**; só o personagem é opaco | sim |

`backgroundColor: "#FFFFFF"` do `playerweb.json` vale só para a tela de splash do UnityLoader.

### Medição

Janela Electron offscreen **transparente** (320×420), lendo o canal alpha do bitmap composto:

| Cenário | alpha = 0 | alpha = 255 | parcial |
|---|---|---|---|
| Widget completo (como o app usava) | 17,7% | 71,9% (painel cinza + personagem) | 10,4% |
| Só o iframe do Unity | **70–71%** | ~29% (personagem) | ~0,8% (bordas com antialiasing) |

Durante a sinalização as mãos saem do tronco e continuam opacas e nítidas — o recorte é feito pelo
próprio Unity, não por pós-processamento.

### APIs oficiais

O widget não oferece opção de fundo. O bridge do Unity (`PlayerManager`, `EmotionBridge`,
`CustomizationBridge`) expõe `playNow`, `stopAll`, `setSlider` (velocidade), `Change` (avatar),
`setSubtitlesState`, `setBaseUrl`, cores de legenda e emoções — nada de fundo, e nada é necessário.

### Decisão

Caminho 2 da priorização (configurar a renderização existente), **sem recompilar o player e sem chroma
key**: o Sinalize dirige o Unity oficial diretamente pelo mesmo protocolo `postMessage` que o widget usa
(`src/renderer/public/vlibras-stage.html`) e descarta o painel HTML do widget. A tradução português →
glosa usa o mesmo serviço do widget (`POST https://traducao2.vlibras.gov.br/translate`), chamado pelo
processo principal: o serviço não envia CORS, e assim o Studio roda com `webSecurity` ligado. Nenhum mecanismo de
segurança do Electron foi desligado para isso: todas as janelas usam `contextIsolation`, `sandbox` e
`nodeIntegration: false`; o Studio roda com `webSecurity`. A página do Unity não envia CSP nem
`X-Frame-Options`, então o app não remove cabeçalhos de segurança de nenhuma resposta. Permissões:
só microfone (áudio), só para as páginas do app; o iframe do player e pedidos de câmera são negados.

**Licença:** VLibras é LGPLv3. O player é carregado do servidor oficial, sem modificação nem
redistribuição de binários.

**Riscos:**
- O protocolo `postMessage` do player é interno ao widget, não uma API pública documentada. A URL está
  fixada em `v=7.12.2`; se o player mudar, o status fica `null`, a fila espera e a página recarrega o
  Unity com backoff (30 s, 60 s, 120 s). Nada da fila é descartado.
- A legenda interna do Unity (glosa desenhada sobre o avatar) fica desligada no overlay e ligada no Studio.

## 2. Arquitetura

```text
Microfone → transcrição (Whisper) → Studio (src/renderer/src/apps/studio)
                                      ├── legenda do Studio ──caption:event──▶ janela de legendas
                                      └── fila FIFO de sinalização
                                             └── motor Unity: palco do Studio  OU  janela do avatar
                                                 (player:cmd / player:status por IPC)
```

- **Sessão única.** Captura, transcrição e fila vivem só na janela do Studio, que nunca é recriada.
  Abrir, fechar ou reconfigurar o overlay não reinicia a captura.
- **Uma instância do Unity.** Com o overlay aberto e o avatar visível, o palco do Studio é descarregado
  (`about:blank`) e mostra um aviso; ao fechar o overlay ou ocultar o avatar, o Unity volta ao Studio.
  A frase que estava sendo sinalizada volta para a frente da fila (`requeue` na telemetria).
- **Troca de motor medida:** ~5 s para o overlay, ~10 s de volta ao Studio (recarga do Unity a partir
  do cache HTTP). Nesse intervalo as frases aguardam na fila.

| Arquivo | Responsabilidade |
|---|---|
| `src/main/overlay/overlay-manager.ts` | `OverlayManager`: janelas, modo edição/apresentação, monitores, atalhos globais, IPC validado, persistência, recuperação de crash |
| `src/main/overlay/overlay-settings.ts` | padrões, presets, validação/merge das configurações, tamanhos derivados |
| `src/main/overlay/display.ts` | geometria multi-monitor (ancoragens, limites, monitor desconectado) |
| `src/shared/overlay.ts`, `src/shared/api.ts` | contratos tipados (configurações, comandos, eventos, canais IPC) |
| `src/renderer/public/vlibras-stage.html` | player VLibras sem o widget (usado no Studio e no overlay) |
| `src/renderer/src/apps/avatar-overlay/` | janela do avatar: ponte do motor, barra de ferramentas, alça de redimensionamento |
| `src/renderer/src/apps/caption-overlay/` | janela de legendas: três origens de texto, estilo, permanência |
| `src/renderer/src/features/overlay/` | aba **Overlay** do Studio e estado espelhado do main |
| `src/renderer/src/features/session/session.ts` | sessão única: roteamento do motor e espelhamento da legenda |
| `src/preload/index.ts` | API `window.sinalize.overlay / player / caption` |

**Contrato IPC** (validado no processo principal, por remetente):

| Canal | Origem → destino | Conteúdo |
|---|---|---|
| `overlay:get` / `overlay:update` / `overlay:command` | Studio (e overlays, só `command`) → main | estado completo; patch validado; comando de uma lista fechada com tipo do argumento |
| `overlay:state` | main → todas as janelas | configurações, monitores, bounds calculados, falhas de atalho |
| `player:cmd` | Studio → main → avatar | `play`, `setSpeed`, `setAvatar`, `stop` |
| `player:status` | avatar → main → Studio | `{ status, speed }` |
| `caption:event` | Studio → main → legendas | `final`, `partial`, `state` (texto limitado a 2000 caracteres) |

Configurações persistem em `%APPDATA%\sinalize\overlay.json` (escrita atômica).

## 3. Validação realizada

Windows 11 (26200), Electron 34.5.8, dois monitores: 1920×1080 a 100% (principal) e 1920×1080 a 125%
à esquerda. Inspeção por Win32 (`GetWindowLong`, `WindowFromPoint`, `WM_NCHITTEST`,
`GetForegroundWindow`) com o processo de inspeção em DPI per-monitor v2, e capturas da tela física.

| Critério | Resultado |
|---|---|
| Transparência real sobre outro aplicativo | ✅ captura da tela física: só o personagem e a caixa da legenda aparecem sobre um navegador em uso |
| Mãos/rosto/roupa preservados | ✅ sem chroma key; alpha vem do Unity |
| Não rouba foco | ✅ janela em primeiro plano idêntica antes e depois de abrir o overlay; janelas com `WS_EX_NOACTIVATE` |
| Sempre em primeiro plano | ✅ `WS_EX_TOPMOST` (nível `screen-saver`) |
| Click-through no modo apresentação | ✅ `WS_EX_TRANSPARENT`; `WindowFromPoint` no centro do avatar e da legenda devolve a janela **abaixo** |
| Arrasto no modo edição | ✅ `WM_NCHITTEST` = `HTCAPTION` na área do avatar e da legenda (arrasto nativo). O gesto com o mouse não foi simulado para não interferir no uso da máquina |
| Ferramentas somem ao apresentar | ✅ captura da tela: nenhuma borda, barra ou alça visível |
| Multi-monitor e DPI | ✅ elemento no monitor a 125%: 290×381 DIP → 363×477 px físicos, posição exata |
| Uma única instância do Unity | ✅ um único frame `vlibras.gov.br/app/unity` em todo o app |
| Troca de motor sem perder frases | ✅ ocultar o avatar no meio da fila: a frase em curso voltou à frente e o Studio retomou dela |
| Persistência | ✅ após reiniciar, posição, monitor e preset restaurados de `overlay.json` |
| Recuperação de falha | ✅ `Page.crash` no renderer do avatar → janela recriada → Unity recarregado → sinalização retomada |
| Atalhos globais | ✅ seis atalhos registrados; duplicados e inválidos são reportados no painel |
| Testes unitários | ✅ `npm test` (geometria, validação, presets, aceleradores, fila, legendas, glossário, telemetria) |
| Gravação contínua | ✅ fala sintética em pt-BR injetada como microfone: VAD cortou na pausa, Whisper local transcreveu as duas frases, parciais ao vivo, legenda e fila |

### Consumo (instância com Studio + overlay, 12 threads de CPU)

| Situação | CPU (1 núcleo = 100%) | RAM da instância |
|---|---|---|
| Overlay aberto, avatar no overlay (ocioso ou sinalizando) | ~95% (renderer do Unity ~51%, GPU ~42%) | ~1,4 GB |
| Overlay fechado, Studio coberto por outras janelas | ~2% | ~1,2 GB |

O custo é o do próprio player Unity renderizando a 60 fps numa janela visível (o mesmo de quando o palco
do Studio está visível): ~8% da CPU total desta máquina. O overlay não duplica o Unity.

## 4. Ainda não validado (checklist manual)

Os testes acima rodaram com a máquina em uso, então nada que tomasse a tela (apresentações em tela
cheia) ou exigisse mouse/teclado simulado foi executado. Antes de um evento, conferir:

- [ ] PowerPoint em modo apresentação (inclusive com Modo de Exibição do Apresentador em dois monitores)
- [ ] Google Slides e Canva em tela cheia no Chrome/Edge
- [ ] Visualizador de PDF em tela cheia
- [ ] Microsoft Teams e Google Meet compartilhando tela inteira e janela específica
- [ ] OBS Studio: captura de tela vs. captura de janela
- [ ] Projetor / tela estendida com resolução diferente
- [ ] Arrastar e redimensionar com o mouse; atalhos globais pelo teclado com o PowerPoint em foco

## 5. Limitações conhecidas

- **Compartilhar uma janela específica não inclui o overlay.** Teams, Meet, Zoom e OBS ("captura de
  janela") capturam só o conteúdo daquela janela. Para o público remoto ver o avatar, compartilhe a
  **tela inteira** ou use no OBS a captura de tela/monitor. O overlay não usa proteção de conteúdo,
  então aparece em capturas de tela inteira (verificado com captura GDI da tela).
- **Tela cheia exclusiva** (jogos e alguns players em DirectX exclusivo) fica acima de qualquer janela
  `topmost`; o overlay não aparece. Apresentações do PowerPoint, Slides, Canva e navegadores em tela
  cheia usam janelas comuns sem borda, onde o overlay fica por cima.
- **Outras janelas `topmost`** (ex.: barra de compartilhamento do Teams) disputam o topo com o overlay;
  a última ativada fica acima.
- **Projetor no modo "duplicar"**: o overlay aparece igual nas duas saídas. Em "estender", escolha o
  monitor do projetor no painel.
- **Sincronia da legenda com o avatar:** a origem "Frase entregue ao avatar" mostra a frase que o player
  está executando, detectada pelo estado `playing` do Unity. O VLibras não informa o progresso sinal a
  sinal, então a legenda não é apresentada como sincronizada com os movimentos.
- **Fontes Geist e Inter** vêm do Google Fonts; sem internet a legenda usa Segoe UI (o VLibras também
  exige internet).
- **Ocultar o avatar** devolve o Unity ao Studio (troca de motor, ~10 s) em vez de manter uma janela
  oculta: janelas ocultas podem ter a renderização suspensa pelo Chromium, o que travaria a fila.
- **Controles sempre ocultos ao apresentar.** A opção "ocultar controles durante apresentações" não
  existe porque a barra precisa sumir sobre os slides; o retorno à edição é pelo atalho global ou pelo
  Studio.

## 6. Atalhos globais

| Ação | Padrão |
|---|---|
| Ativar/desativar overlay | `Ctrl+Alt+Shift+O` |
| Alternar modo edição | `Ctrl+Alt+Shift+E` |
| Mostrar/ocultar avatar | `Ctrl+Alt+Shift+A` |
| Mostrar/ocultar legendas | `Ctrl+Alt+Shift+L` |
| Restaurar posições | `Ctrl+Alt+Shift+R` |
| Iniciar/encerrar captura | `Ctrl+Alt+Shift+M` |

Os `Ctrl+Shift+<letra>` sugeridos inicialmente colidem com atalhos do Teams (`M` mudo, `O` câmera,
`E` compartilhar) e do Chrome/Edge (`O` favoritos, `A` busca de abas, `R` recarregar, `M` perfil).
Um atalho global do Windows tem precedência sobre o app em foco, então `Ctrl+Shift+M` desligaria o
microfone do Sinalize em vez de silenciar o Teams. Todos são editáveis na aba Overlay; aceleradores
precisam de um modificador além de Shift e de uma tecla conhecida: nos testes o Electron registrou
`Ctrl+Nada+X` sem reportar erro, então a validação é feita antes do registro. Os atalhos são removidos ao sair do app.
