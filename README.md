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
| Desktop | Electron 34 |
| UI | HTML/CSS/JS vanilla |
| Reconhecimento de voz | OpenAI Whisper API (`whisper-1`) |
| Tradução | VLibras Player Web (open source — governo federal) |
| Avatar 3D | Unity WebGL + dicionário de sinais VLibras |
| Comunicação entre janelas | IPC nativo do Electron |

## 🚀 Como rodar

```bash
git clone <repo>
cd sinalize
npm install
npm.cmd start
```

Duas janelas abrem:
- **Controle** — entrada de voz/texto e frases prontas
- **Avatar** — animação 3D em Libras com legenda

## 📁 Estrutura

```
sinalize/
├── main.js              # Processo principal Electron, cria janelas e IPC
├── preload.js           # Expõe API segura para a janela de controle
├── renderer/
│   ├── control.html     # Janela de controle (voz/texto/frases)
│   └── avatar.html      # Janela do avatar VLibras com legenda
└── package.json
```

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
