import { useState, type ComponentType, type ReactNode } from 'react'
import { AudioLines, Cpu, Eye, EyeOff, Gauge, Keyboard, Languages, Mic, Palette, PictureInPicture2, Plus, Projector, RefreshCw, Settings2, SlidersHorizontal, Trash2, UserRound, Wrench } from 'lucide-react'
import { useStore } from 'zustand'
import { AVATAR_LABELS, AVATARS, SHORTCUT_ACTIONS, type AvatarName, type ShortcutAction } from '../../../../shared/output'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatusDot } from '@/components/workspace/StatusDot'
import { cn } from '@/lib/utils'
import { MONITOR_BACKGROUNDS, appearanceStore, setAppearance, type MonitorBackground } from '../appearance/appearance-store'
import { AudioCalibration } from '../audio/AudioModule'
import { DeviceSelect, GainControl } from '../audio/Mixer'
import { systemStore } from '../diagnostics/system-store'
import { notify } from '../notify'
import { SelectSetting, SettingRow, SettingsGroup, ShortcutSetting, SwitchSetting } from '../output/fields'
import { OverlaySettingsForm, PresentationSettingsForm } from '../output/OutputsModule'
import { outputStore, outputUpdate } from '../output/output-store'
import { checkLocalServer, serverStore } from '../session/server-status'
import { STT_PROVIDERS, sttStore, type SttProviderId } from '../session/stt'
import { MAX_PHRASES, phrasesStore, setPhrases } from '../translation/quick-phrases'
import { WORKSPACE_PRESETS, workspace, workspaceStore } from '../workspace/workspace-store'

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleOverlay: 'Ativar/desativar overlay',
  toggleEdit: 'Alternar modo edição do overlay',
  toggleAvatar: 'Mostrar/ocultar avatar flutuante',
  toggleCaption: 'Mostrar/ocultar legendas flutuantes',
  resetLayout: 'Restaurar posições do overlay',
  toggleMic: 'Iniciar/encerrar sessão',
}

const LOCAL_SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Paleta de comandos'],
  ['Ctrl+,', 'Configurações'],
  ['Ctrl+Shift+Enter', 'Iniciar/encerrar sessão'],
  ['Ctrl+Shift+P', 'Pausar/retomar captura'],
  ['Ctrl+Shift+D', 'Diagnóstico'],
  ['Ctrl+Enter', 'Sinalizar o texto digitado'],
  ['1–9', 'Frases rápidas (fora de campos de texto)'],
  ['F11', 'Monitor em tela cheia'],
]

function GeneralSettings() {
  const preset = useStore(workspaceStore, (s) => s.preset)
  const app = useStore(systemStore, (s) => s.app)
  return (
    <>
      <SettingsGroup title="Workspace">
        <SelectSetting label="Layout dos painéis" value={preset} options={WORKSPACE_PRESETS.map((p) => ({ value: p.id, label: p.label }))} onChange={workspace.applyPreset} />
        <SettingRow label="Restaurar" hint="Volta os tamanhos e a visibilidade dos docks ao preset atual.">
          <Button size="sm" onClick={() => workspace.applyPreset(preset)}>
            Restaurar layout
          </Button>
        </SettingRow>
      </SettingsGroup>
      {app && (
        <SettingsGroup title="Sobre">
          <SettingRow label="Versão">
            <span className="font-mono text-xs text-fg-2">
              Sinalize Studio {app.version} · Electron {app.electron}
            </span>
          </SettingRow>
        </SettingsGroup>
      )}
    </>
  )
}

function AppearanceSettings() {
  const { theme, monitorBackground, monitorSubtitles } = useStore(appearanceStore)
  return (
    <SettingsGroup title="Interface">
      <SelectSetting
        label="Tema"
        value={theme}
        options={[
          { value: 'dark', label: 'Escuro' },
          { value: 'light', label: 'Claro' },
        ]}
        onChange={(v) => setAppearance({ theme: v as 'dark' | 'light' })}
      />
      <SelectSetting
        label="Fundo do monitor"
        hint="O avatar é transparente; o verde serve para chroma key em softwares de transmissão."
        value={monitorBackground}
        options={MONITOR_BACKGROUNDS.map((b) => ({ value: b.id, label: b.label }))}
        onChange={(v) => setAppearance({ monitorBackground: v as MonitorBackground })}
      />
      <SwitchSetting label="Glosa do VLibras no monitor" hint="Texto em glosa desenhado pelo player acima do avatar (recarrega o player)." checked={monitorSubtitles} onChange={(v) => setAppearance({ monitorSubtitles: v })} />
    </SettingsGroup>
  )
}

function AudioSettings() {
  return (
    <>
      <SettingsGroup title="Entrada">
        <SettingRow label="Dispositivo">
          <DeviceSelect className="w-full" />
        </SettingRow>
        <SettingRow label="Ganho e mudo" hint="Afetam também o áudio enviado ao reconhecimento de voz.">
          <div className="flex-1">
            <GainControl />
          </div>
        </SettingRow>
      </SettingsGroup>
      <AudioCalibration />
    </>
  )
}

function SpeechSettings() {
  const { provider, apiKey } = useStore(sttStore)
  const { state, models } = useStore(serverStore)
  const [showKey, setShowKey] = useState(false)
  return (
    <>
      <SettingsGroup title="Serviço">
        <SelectSetting
          label="Provedor"
          value={provider}
          options={Object.entries(STT_PROVIDERS).map(([id, p]) => ({ value: id, label: p.label }))}
          onChange={(v) => {
            sttStore.setState({ provider: v as SttProviderId })
            if (v === 'local') void checkLocalServer(true)
          }}
        />
        <SettingRow label="Modelo">
          <span className="font-mono text-xs text-fg-2">{STT_PROVIDERS[provider].model}</span>
        </SettingRow>
      </SettingsGroup>
      {provider === 'openai' ? (
        <SettingsGroup title="OpenAI">
          <SettingRow label="Chave da API" hint="Guardada só neste computador.">
            <Input type={showKey ? 'text' : 'password'} value={apiKey} placeholder="sk-…" autoComplete="off" className="font-mono" onChange={(e) => sttStore.setState({ apiKey: e.target.value })} />
            <Button size="icon-sm" variant="ghost" aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'} onClick={() => setShowKey((v) => !v)}>
              {showKey ? <EyeOff /> : <Eye />}
            </Button>
          </SettingRow>
        </SettingsGroup>
      ) : (
        <SettingsGroup title="Servidor local (speaches)">
          <SettingRow label="Estado">
            <span className="flex items-center gap-1.5 text-xs">
              <StatusDot tone={state === 'online' ? 'ok' : state === 'checking' ? 'warn' : 'error'} />
              localhost:8000 · {state === 'online' ? 'online' : state === 'checking' ? 'verificando' : 'offline'}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void checkLocalServer(true)}>
              <RefreshCw /> Verificar
            </Button>
          </SettingRow>
          <SettingRow label="Modelos instalados">
            <span className="font-mono text-[11px] text-fg-2">{models.length ? models.join(', ') : '—'}</span>
          </SettingRow>
        </SettingsGroup>
      )}
      <SettingsGroup title="Proteção contra loops">
        <p className="text-[11px] leading-relaxed text-fg-3">
          Segmentos com repetição anômala ("o que é que é que é que…") são detectados e transcritos de novo com temperatura de fallback. Se o loop persistir, só o trecho repetido é
          removido. Repetições naturais da fala são preservadas. Cada ocorrência aparece no Diagnóstico.
        </p>
      </SettingsGroup>
    </>
  )
}

function PhrasesEditor() {
  const stored = useStore(phrasesStore, (s) => s.phrases)
  const [draft, setDraft] = useState(stored)
  const dirty = draft.join('\n') !== stored.join('\n')
  return (
    <SettingsGroup title="Frases rápidas (teclas 1–9)">
      {draft.map((phrase, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-4 font-mono text-[11px] text-fg-3">{i + 1}</span>
          <Input value={phrase} maxLength={120} onChange={(e) => setDraft(draft.with(i, e.target.value))} aria-label={`Frase ${i + 1}`} />
          <Button size="icon-sm" variant="ghost" aria-label={`Remover frase ${i + 1}`} onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex justify-between">
        <Button size="sm" variant="ghost" disabled={draft.length >= MAX_PHRASES} onClick={() => setDraft([...draft, ''])}>
          <Plus /> Adicionar frase
        </Button>
        <Button
          size="sm"
          variant="default"
          disabled={!dirty}
          onClick={() => {
            setPhrases(draft)
            notify.success('Frases rápidas salvas')
          }}
        >
          Salvar frases
        </Button>
      </div>
    </SettingsGroup>
  )
}

function AvatarSettings() {
  const state = useStore(outputStore, (s) => s.state)
  if (!state) return null
  const { avatar } = state.settings
  return (
    <SettingsGroup title="Avatar VLibras">
      <SelectSetting label="Personagem" value={avatar.character} options={AVATARS.map((a) => ({ value: a, label: AVATAR_LABELS[a] }))} onChange={(v) => void outputUpdate({ avatar: { character: v as AvatarName } })} />
      <SelectSetting
        label="Velocidade base"
        hint="Com fila acumulada a velocidade sobe até +0,5x automaticamente (máximo 2,5x)."
        value={String(avatar.speed)}
        options={[1, 1.5, 2].map((s) => ({ value: String(s), label: `${s.toLocaleString('pt-BR')}x` }))}
        onChange={(v) => void outputUpdate({ avatar: { speed: Number(v) } })}
      />
    </SettingsGroup>
  )
}

function ShortcutSettings() {
  const state = useStore(outputStore, (s) => s.state)
  return (
    <>
      {state && (
        <SettingsGroup title="Atalhos globais (funcionam com outro app em foco)">
          {SHORTCUT_ACTIONS.map((action) => (
            <ShortcutSetting
              key={action}
              label={SHORTCUT_LABELS[action]}
              value={state.settings.shortcuts[action]}
              failed={state.shortcutFailures.includes(action)}
              onCommit={(v) => void outputUpdate({ shortcuts: { [action]: v } })}
            />
          ))}
          <p className="text-[11px] text-fg-3">Formato: Ctrl+Alt+Shift+O. Ctrl+Shift+letra colide com Teams e navegadores; deixe vazio para desativar.</p>
        </SettingsGroup>
      )}
      <SettingsGroup title="Atalhos do Studio">
        {LOCAL_SHORTCUTS.map(([keys, label]) => (
          <SettingRow key={keys} label={label}>
            <kbd className="rounded-xs border border-line bg-elevated px-1.5 font-mono text-[11px] text-fg-2">{keys}</kbd>
          </SettingRow>
        ))}
      </SettingsGroup>
    </>
  )
}

function PerformanceSettings() {
  const metrics = useStore(systemStore, (s) => s.metrics)
  return (
    <SettingsGroup title="Recursos em uso">
      {!metrics ? (
        <p className="text-xs text-fg-3">Aguardando a primeira amostra…</p>
      ) : (
        <>
          <SettingRow label="CPU do sistema">
            <span className="font-mono text-xs">{metrics.cpuPct ?? '—'}% (Sinalize: {metrics.appCpuPct}% de 1 núcleo)</span>
          </SettingRow>
          <SettingRow label="Memória do Sinalize">
            <span className="font-mono text-xs">{metrics.appRamMB} MB</span>
          </SettingRow>
          <SettingRow label="GPU">
            <span className="font-mono text-xs">{metrics.gpu ? `${metrics.gpu.name} · ${metrics.gpu.util}% · ${metrics.gpu.usedMB}/${metrics.gpu.totalMB} MB` : 'Não detectada (nvidia-smi ausente)'}</span>
          </SettingRow>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-fg-3">
        O player Unity do VLibras roda em uma única instância, na saída ativa (Studio, Telão ou Overlay). O maior custo de CPU e GPU é a animação contínua do personagem visível.
      </p>
    </SettingsGroup>
  )
}

function AdvancedSettings() {
  return (
    <SettingsGroup title="Manutenção">
      <SettingRow label="Telemetria" hint="Apaga os eventos de latência desta execução.">
        <Button size="sm" onClick={() => void window.sinalize.diag.reset().then(() => notify.success('Telemetria zerada'))}>
          Zerar diagnóstico
        </Button>
      </SettingRow>
      <SettingRow label="Preferências do Studio" hint="Tema, workspace, áudio e frases rápidas voltam ao padrão. Glossário e chave da API são mantidos.">
        <Button
          size="sm"
          variant="destructive-outline"
          onClick={() => {
            for (const key of ['sinalize_appearance', 'sinalize_workspace', 'sinalize_audio', 'sinalize_quick_phrases']) localStorage.removeItem(key)
            location.reload()
          }}
        >
          Restaurar padrões
        </Button>
      </SettingRow>
    </SettingsGroup>
  )
}

const CATEGORIES: { id: string; label: string; icon: ComponentType<{ className?: string }>; render: () => ReactNode }[] = [
  { id: 'general', label: 'Geral', icon: Settings2, render: () => <GeneralSettings /> },
  { id: 'appearance', label: 'Aparência', icon: Palette, render: () => <AppearanceSettings /> },
  { id: 'audio', label: 'Áudio', icon: AudioLines, render: () => <AudioSettings /> },
  { id: 'speech', label: 'Reconhecimento de voz', icon: Mic, render: () => <SpeechSettings /> },
  { id: 'translation', label: 'Tradução', icon: Languages, render: () => <PhrasesEditor /> },
  { id: 'avatar', label: 'Avatar', icon: UserRound, render: () => <AvatarSettings /> },
  { id: 'presentation', label: 'Telão', icon: Projector, render: () => <OutputForm kind="presentation" /> },
  { id: 'overlay', label: 'Overlay', icon: PictureInPicture2, render: () => <OutputForm kind="overlay" /> },
  { id: 'shortcuts', label: 'Atalhos', icon: Keyboard, render: () => <ShortcutSettings /> },
  { id: 'performance', label: 'Desempenho', icon: Gauge, render: () => <PerformanceSettings /> },
  { id: 'advanced', label: 'Avançado', icon: Wrench, render: () => <AdvancedSettings /> },
]

function OutputForm({ kind }: { kind: 'presentation' | 'overlay' }) {
  const state = useStore(outputStore, (s) => s.state)
  if (!state) return null
  return kind === 'presentation' ? <PresentationSettingsForm state={state} /> : <OverlaySettingsForm state={state} />
}

export function SettingsDialog() {
  const { settingsOpen, settingsCategory } = useStore(workspaceStore)
  const current = CATEGORIES.find((c) => c.id === settingsCategory) ?? CATEGORIES[0]!

  return (
    <Dialog open={settingsOpen} onOpenChange={workspace.setSettingsOpen}>
      <DialogContent className="flex h-[min(640px,88vh)] w-[min(900px,92vw)] max-w-none gap-0 overflow-hidden rounded-lg border-line bg-panel p-0 sm:max-w-none">
        <nav aria-label="Categorias" className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-line bg-chrome p-2">
          <div className="flex items-center gap-2 px-2 pt-1 pb-3">
            <SlidersHorizontal className="size-3.5 text-fg-3" />
            <DialogTitle className="text-[13px] font-semibold">Configurações</DialogTitle>
          </div>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => workspaceStore.setState({ settingsCategory: c.id })}
              aria-current={c.id === current.id ? 'page' : undefined}
              className={cn('flex h-7 items-center gap-2 rounded-md px-2 text-left text-xs text-fg-2 hover:bg-hover hover:text-fg', c.id === current.id && 'bg-elevated text-fg')}
            >
              <c.icon className="size-3.5" />
              {c.label}
            </button>
          ))}
          <div className="mt-auto flex items-center gap-1.5 px-2 pt-2 text-[10px] text-fg-3">
            <Cpu className="size-3" /> Alterações são aplicadas na hora
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-11 shrink-0 items-center border-b border-line px-5 pr-12">
            <h2 className="text-sm font-semibold">{current.label}</h2>
            <DialogDescription className="sr-only">Configurações de {current.label}</DialogDescription>
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-5">{current.render()}</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
