# 🤟 Sinalize

Tradutor de português para Libras em tempo real — aplicação desktop que captura voz ou texto e exibe a tradução em um avatar 3D usando o VLibras.

## 🎯 Problema

Segundo o IBGE, o Brasil tem aproximadamente **2,3 milhões de pessoas com deficiência auditiva**. A maioria dos eventos, palestras, treinamentos e conteúdos institucionais **não oferece intérprete de Libras**, seja pelo custo elevado da contratação ou pela indisponibilidade de profissionais. A Lei Brasileira de Inclusão (Lei 13.146/2015) prevê a acessibilidade comunicacional, mas a implementação prática ainda é falha.

## 💡 Solução

O Sinalize automatiza a tradução de português para Libras em situações onde não há intérprete humano disponível, oferecendo acessibilidade de melhor esforço através de:

- Captura de **voz em tempo real** via microfone
- **Entrada manual de texto** para conteúdo preparado
- **Frases prontas** com vocabulário garantido pelo dicionário VLibras
- Exibição em **avatar 3D** com legenda em português sempre visível

## 🏗️ Arquitetura

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Microfone /    │──────▶│  Reconhecimento │──────▶│   Tradutor      │
│  Texto manual   │       │  de voz (Web    │       │   VLibras       │
│                 │       │  Speech API)    │       │   (Português →  │
└─────────────────┘       └─────────────────┘       │     Glosa)      │
                                                    └────────┬────────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │  Avatar 3D      │
                                                    │  Unity WebGL    │
                                                    │  (Sinalização)  │
                                                    └─────────────────┘
```

**Fluxo:**

1. Usuário fala no microfone (ou digita texto)
2. Web Speech API transcreve para texto em PT-BR
3. Texto é enviado via IPC do Electron para a janela do avatar
4. Player VLibras traduz texto → glosa (representação intermediária em Libras)
5. Glosa é convertida em sinais animados pelo avatar 3D (Unity)
6. Legenda em português aparece simultaneamente sobre o avatar

## 🛠️ Stack

| Camada | Tecnologia |
|---|---|
| Desktop | Electron 34 + electron-vite |
| UI | React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, Lucide |
| Reconhecimento de voz | Whisper: OpenAI (`gpt-4o-mini-transcribe`) ou servidor local speaches |
| Tradução | Serviço de tradução do VLibras (português → glosa) |
| Avatar 3D | Player Unity WebGL oficial do VLibras, sem o widget (fundo transparente) |
| Comunicação entre janelas | IPC tipado do Electron (`src/shared`) |
| Qualidade | Vitest, ESLint (typescript-eslint + react-hooks) |

## 🚀 Como rodar

```bash
git clone <repo>
cd sinalize
npm install
npm run dev     # desenvolvimento com recarga automática
npm start       # compila e abre a versão de produção
```

```bash
npm run check   # typecheck + lint + testes + build
```

A janela do **Studio** reúne o palco do avatar, a legenda e o painel de controle. Modos de exibição:
- **Studio** — operação completa (voz, texto, frases prontas, glossário)
- **Telão** — palco e legenda ampliados para projeção
- **Overlay** — avatar e legendas flutuando sobre PowerPoint, navegador, PDF ou reuniões
  (aba *Overlay* ou `Ctrl+Alt+Shift+O`; detalhes, validação e limitações em [docs/overlay.md](docs/overlay.md))

## 📁 Estrutura

```
src/
├── main/                    # Processo principal
│   ├── index.ts             # Janela do Studio, protocolo app://, tradução VLibras, diagnóstico
│   ├── telemetry.ts         # Métricas por segmento (painel Ctrl+Shift+D)
│   └── overlay/             # Modo Overlay: OverlayManager, configurações validadas, geometria multi-monitor
├── preload/index.ts         # API window.sinalize (contextBridge)
├── shared/                  # Contratos tipados de IPC e do overlay
└── renderer/
    ├── studio.html, avatar-overlay.html, caption-overlay.html
    ├── public/              # vlibras-stage.html (player Unity) e diag.html
    └── src/
        ├── apps/            # Entradas React: studio, avatar-overlay, caption-overlay
        ├── features/        # avatar (fila, player), captions, glossary, session (gravação, STT), overlay
        ├── components/ui/   # shadcn/ui
        └── lib/             # store observável, telemetria, utilitários
```

A lógica de tempo real (gravação com VAD, fila de sinalização, legenda) fica em classes TypeScript fora
do React, observadas com `useSyncExternalStore`: os timers de 50 ms não disparam renderizações.

## ⚠️ Limitações conhecidas

Esta seção é **deliberadamente transparente** — entender os limites é parte do projeto.

### Dicionário VLibras
- **Vocabulário incompleto**: termos técnicos, nomes próprios e jargões caem em **datilologia** (soletração letra por letra), difícil de acompanhar.
- **Glosa, não Libras nativa**: o VLibras gera uma representação simplificada que omite expressões faciais e morfologia da Libras real. A comunidade surda relata dificuldade em compreender traduções automáticas comparadas a intérpretes humanos.

### Velocidade
- O avatar leva **~1-3 segundos por sinal**. Fala normal é ~150 palavras/min. O avatar **não acompanha** discurso contínuo.
- Sem fila inteligente, frases longas podem acumular atraso significativo.

### Reconhecimento de voz
- Usa a API **OpenAI Whisper** (`whisper-1`), que requer chave de API e conexão com internet.
- A chave é configurada na interface e armazenada em `localStorage` (não fica no código-fonte).
- A Web Speech API nativa do Chromium foi **descartada** porque o Electron usa um Chromium sem a chave do Google embarcada — todas as requisições retornam `network error`.
- Precisão degrada com: ruído de fundo extremo, microfone muito distante, termos técnicos muito específicos.

### Aspecto legal
- **Não substitui intérprete humano** em contextos formais conforme a Lei 13.146/2015.
- Posicionamento correto: acessibilidade automatizada de **melhor esforço** para situações sem intérprete disponível, complementar a outras formas de acessibilidade (legenda).

## 🔮 Próximos passos

Roadmap de evolução para tornar o Sinalize viável em contextos mais exigentes:

1. **Whisper local** substituindo Web Speech API — transcrição offline com qualidade muito superior, especialmente para termos técnicos e ruído.
2. **Segmentação por frase** — esperar pontuação ou pausa antes de enviar ao avatar, evitando traduções de fragmentos.
3. **Fila inteligente** no avatar — TTL por frase, coalescência de mensagens curtas, indicador de atraso.
4. **Glossário customizável** por palestra/evento — pré-cadastro de termos técnicos com mapeamento manual de sinais.
5. **Modo apresentação** — janela do avatar fullscreen para projeção em auditórios + saída web mobile para espectadores acompanharem no celular.
6. **Painel de operador** — supervisão humana para correção de transcrição ao vivo durante eventos.

## 📄 Licença

Projeto acadêmico — Projeto Integrador.

VLibras é um software livre desenvolvido pelo Governo Federal Brasileiro, licenciado sob LGPLv3.
