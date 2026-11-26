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

Electron 34 + electron-vite, React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui, Lucide, Zustand,
React Resizable Panels, TanStack Virtual, Zod, cmdk, Sonner e Motion. Testes com Vitest, Playwright
e axe-core. Reconhecimento de voz com Whisper (OpenAI ou servidor local speaches) e avatar 3D pelo
player Unity oficial do VLibras. Detalhes e decisões em [docs/arquitetura-v2.md](docs/arquitetura-v2.md).

## 🚀 Como rodar

```bash
npm install
npm run dev     # desenvolvimento com recarga automática
npm start       # compila e abre a versão de produção
npm run check   # typecheck + lint + testes + build
npm run e2e     # testes E2E no app real (perfil isolado) e capturas em docs/screenshots
```

O **Sinalize Studio** é uma estação de operação no estilo de software de transmissão: monitor de
sinalização no centro, docks redimensionáveis (controle de sessão, mixer de áudio, fila de
sinalização, tradução manual e transcrição ao vivo), módulos na barra lateral (Áudio, Transcrições,
Glossário, Histórico, Overlay e Telão, Diagnóstico), menus, paleta de comandos (Ctrl+K) e barra de
status com métricas reais. Saídas do avatar:

- **Studio** — monitor de sinalização da própria estação
- **Telão** — janela de projeção só com avatar, legenda e fundo
- **Overlay** — avatar e legendas flutuando sobre PowerPoint, navegador, PDF ou reuniões
  ([docs/overlay.md](docs/overlay.md))

## 📁 Estrutura

Ver [docs/arquitetura-v2.md](docs/arquitetura-v2.md#estrutura). Correção do loop de transcrição em
[docs/transcricao-loop.md](docs/transcricao-loop.md).

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
