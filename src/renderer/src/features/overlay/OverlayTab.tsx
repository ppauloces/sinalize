import { useState, type FormEvent } from 'react'
import { Lock, PanelsTopLeft, RotateCcw, Save, Trash2, Unlock, X } from 'lucide-react'
import {
  AVATARS,
  DEFAULT_ANCHOR,
  FONTS,
  SHORTCUT_ACTIONS,
  type Anchor,
  type CaptionSource,
  type FontFamily,
  type OverlayKind,
  type OverlayPatch,
  type OverlayState,
  type ShortcutAction,
} from '../../../../shared/overlay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Kbd, Panel, SectionLabel } from '@/components/section'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { setStatus } from '../session/status'
import { ColorField, SelectField, ShortcutField, SliderField, SwitchField } from './fields'
import { overlayCommand, overlayStore, overlayUpdate } from './overlay-store'
import { OverlayPreview } from './OverlayPreview'

const ANCHOR_OPTIONS: { value: Anchor; label: string; disabled?: boolean }[] = [
  { value: 'top-left', label: 'Superior esquerdo' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom-center', label: 'Inferior central' },
  { value: 'custom', label: 'Personalizado (arrastado)', disabled: true },
]

const AVATAR_LABELS: Record<(typeof AVATARS)[number], string> = { icaro: 'Ícaro', hosana: 'Hosana', guga: 'Guga' }

const SOURCE_OPTIONS: { value: CaptionSource; label: string }[] = [
  { value: 'live', label: 'Transcrição em tempo real (inclui trecho provisório)' },
  { value: 'final', label: 'Texto consolidado da transcrição' },
  { value: 'signing', label: 'Frase entregue ao avatar (sem sincronia por sinal)' },
]

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleOverlay: 'Ativar/desativar overlay',
  toggleEdit: 'Alternar modo edição',
  toggleAvatar: 'Mostrar/ocultar avatar',
  toggleCaption: 'Mostrar/ocultar legendas',
  resetLayout: 'Restaurar posições',
  toggleMic: 'Iniciar/encerrar captura',
}

const px = (v: number) => `${v}px`

// Trocar ancoragem ou monitor descarta a posição livre arrastada.
function placementPatch(state: OverlayState, kind: OverlayKind, change: { anchor?: Anchor; displayId?: number }): OverlayPatch {
  const anchor = change.anchor ?? (state.settings[kind].anchor === 'custom' ? DEFAULT_ANCHOR[kind] : state.settings[kind].anchor)
  return { [kind]: { ...change, anchor, x: null, y: null } }
}

function PlacementFields({ state, kind }: { state: OverlayState; kind: OverlayKind }) {
  return (
    <>
      <SelectField
        label="Posição"
        value={state.settings[kind].anchor}
        options={ANCHOR_OPTIONS}
        onChange={(v) => void overlayUpdate(placementPatch(state, kind, { anchor: v as Anchor }))}
      />
      <SelectField
        label="Monitor"
        value={String(state.bounds[kind].displayId)}
        options={state.displays.map((d) => ({ value: String(d.id), label: d.label + (d.primary ? ' (principal)' : '') }))}
        onChange={(v) => void overlayUpdate(placementPatch(state, kind, { displayId: Number(v) }))}
      />
    </>
  )
}

function StatusCard({ state }: { state: OverlayState }) {
  const presenting = state.active && !state.editing
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('min-w-32 flex-1 text-[0.76rem] font-semibold', !state.active ? 'text-muted-foreground' : presenting ? 'text-success' : 'text-warning')}>
          {!state.active ? 'Overlay desligado' : presenting ? 'Overlay ativo · apresentando' : 'Overlay ativo · modo edição'}
        </span>
        <Button variant={state.active ? 'outline' : 'brand'} size="sm" onClick={() => void overlayCommand('toggle')}>
          {state.active ? <X /> : <PanelsTopLeft />}
          {state.active ? 'Fechar overlay' : 'Abrir overlay'}
        </Button>
        <Button variant="outline" size="sm" disabled={!state.active} onClick={() => void overlayCommand('toggleEdit')}>
          {presenting ? <Unlock /> : <Lock />}
          {presenting ? 'Voltar à edição' : 'Bloquear e apresentar'}
        </Button>
        <Button variant="ghost" size="sm" title="Restaurar posições padrão" onClick={() => void overlayCommand('reset')}>
          <RotateCcw />
          Restaurar
        </Button>
      </div>
      <OverlayPreview state={state} />
      <p className="text-[0.74rem] leading-relaxed text-muted-foreground">
        Apresentando, o overlay deixa os cliques passarem para o PowerPoint e os demais apps. Para voltar à edição use{' '}
        <Kbd>{state.settings.shortcuts.toggleEdit || 'sem atalho'}</Kbd> ou o botão acima.
      </p>
    </Panel>
  )
}

function PresetsCard({ state }: { state: OverlayState }) {
  const [selected, setSelected] = useState('palestra')
  const preset = state.presets.find((p) => p.id === selected) ?? state.presets[0]

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    void overlayCommand('savePreset', name).then(() => {
      setSelected(name)
      form.reset()
      setStatus(`Preset "${name}" salvo`, 'active')
    })
  }

  return (
    <Panel>
      <div className="flex gap-2">
        <Select value={preset?.id} onValueChange={setSelected}>
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {state.presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
                {p.builtin ? '' : ' (personalizado)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={!preset} onClick={() => preset && void overlayCommand('applyPreset', preset.id)}>
          Aplicar
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Excluir preset personalizado"
          disabled={!preset || preset.builtin}
          onClick={() => preset && confirm(`Excluir o preset "${preset.label}"?`) && void overlayCommand('deletePreset', preset.id)}
        >
          <Trash2 />
        </Button>
      </div>
      <form className="flex gap-2" onSubmit={save}>
        <Input name="name" maxLength={40} required placeholder="Nome para salvar a configuração atual" className="h-8 min-w-0 flex-1" />
        <Button type="submit" variant="outline" size="sm">
          <Save />
          Salvar preset
        </Button>
      </form>
    </Panel>
  )
}

export function OverlayTab() {
  const state = useStore(overlayStore)
  if (!state) return <p className="py-6 text-center text-sm text-muted-foreground">Carregando configurações do overlay…</p>
  const { avatar, caption, behavior, shortcuts } = state.settings
  const presenting = state.active && !state.editing

  return (
    <div className="flex flex-col gap-3">
      <StatusCard state={state} />

      <SectionLabel>Presets de apresentação</SectionLabel>
      <PresetsCard state={state} />

      <SectionLabel>Avatar</SectionLabel>
      <Panel id="overlay-avatar" className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <SwitchField label="Exibir avatar" checked={avatar.visible} onChange={(visible) => void overlayUpdate({ avatar: { visible } })} />
        <SwitchField label="Sempre em primeiro plano" checked={avatar.alwaysOnTop} onChange={(alwaysOnTop) => void overlayUpdate({ avatar: { alwaysOnTop } })} />
        <SwitchField wide label="Bloquear posição (modo apresentação)" checked={presenting} onChange={(lock) => void overlayCommand('edit', !lock)} />
        <SelectField
          label="Personagem"
          value={avatar.character}
          options={AVATARS.map((a) => ({ value: a, label: AVATAR_LABELS[a] }))}
          onChange={(v) => void overlayUpdate({ avatar: { character: v as (typeof AVATARS)[number] } })}
        />
        <SelectField
          label="Velocidade base"
          value={String(avatar.speed)}
          options={[1, 1.5, 2].map((s) => ({ value: String(s), label: `${String(s).replace('.', ',')}x` }))}
          onChange={(v) => void overlayUpdate({ avatar: { speed: Number(v) } })}
        />
        <SliderField wide label="Tamanho" value={avatar.width} min={140} max={900} step={10} format={px} onChange={(width) => void overlayUpdate({ avatar: { width } })} />
        <PlacementFields state={state} kind="avatar" />
      </Panel>

      <SectionLabel>Legendas</SectionLabel>
      <Panel id="overlay-caption" className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <SwitchField wide label="Exibir legendas" checked={caption.visible} onChange={(visible) => void overlayUpdate({ caption: { visible } })} />
        <SwitchField label="Sombra do texto" checked={caption.shadow} onChange={(shadow) => void overlayUpdate({ caption: { shadow } })} />
        <SwitchField label="Contorno do texto" checked={caption.outline} onChange={(outline) => void overlayUpdate({ caption: { outline } })} />
        <SelectField wide label="Origem do texto" value={caption.source} options={SOURCE_OPTIONS} onChange={(v) => void overlayUpdate({ caption: { source: v as CaptionSource } })} />
        <SelectField label="Fonte" value={caption.fontFamily} options={FONTS.map((f) => ({ value: f, label: f }))} onChange={(v) => void overlayUpdate({ caption: { fontFamily: v as FontFamily } })} />
        <SelectField
          label="Peso"
          value={String(caption.fontWeight)}
          options={[
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Médio' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Negrito' },
            { value: '800', label: 'Extra negrito' },
          ]}
          onChange={(v) => void overlayUpdate({ caption: { fontWeight: Number(v) } })}
        />
        <SliderField label="Tamanho" value={caption.fontSize} min={14} max={96} step={1} format={px} onChange={(fontSize) => void overlayUpdate({ caption: { fontSize } })} />
        <SliderField label="Largura máxima" value={caption.maxWidth} min={300} max={2400} step={20} format={px} onChange={(maxWidth) => void overlayUpdate({ caption: { maxWidth } })} />
        <ColorField label="Cor do texto" value={caption.color} onChange={(color) => void overlayUpdate({ caption: { color } })} />
        <ColorField label="Cor do fundo" value={caption.bgColor} onChange={(bgColor) => void overlayUpdate({ caption: { bgColor } })} />
        <SliderField label="Opacidade do fundo" value={caption.bgOpacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(bgOpacity) => void overlayUpdate({ caption: { bgOpacity } })} />
        <SliderField label="Espaçamento entre linhas" value={caption.lineHeight} min={1} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(lineHeight) => void overlayUpdate({ caption: { lineHeight } })} />
        <SliderField label="Máximo de linhas" value={caption.maxLines} min={1} max={6} step={1} onChange={(maxLines) => void overlayUpdate({ caption: { maxLines } })} />
        <SliderField
          label="Permanência após a fala"
          value={caption.holdMs}
          min={0}
          max={15000}
          step={500}
          format={(v) => (v ? `${v / 1000}s` : 'sempre visível')}
          onChange={(holdMs) => void overlayUpdate({ caption: { holdMs } })}
        />
        <PlacementFields state={state} kind="caption" />
      </Panel>

      <SectionLabel>Comportamento</SectionLabel>
      <Panel className="gap-1">
        <SwitchField label="Permitir cliques através do overlay ao apresentar" checked={behavior.clickThrough} onChange={(clickThrough) => void overlayUpdate({ behavior: { clickThrough } })} />
        <SwitchField label="Restaurar a última posição ao abrir" checked={behavior.restoreLast} onChange={(restoreLast) => void overlayUpdate({ behavior: { restoreLast } })} />
        <SwitchField label="Abrir o overlay ao iniciar a gravação" checked={behavior.autoStart} onChange={(autoStart) => void overlayUpdate({ behavior: { autoStart } })} />
        <SwitchField label="Posicionar pela tela inteira (ignorar a barra de tarefas)" checked={behavior.useFullBounds} onChange={(useFullBounds) => void overlayUpdate({ behavior: { useFullBounds } })} />
      </Panel>

      <SectionLabel hint="Ex.: Ctrl+Alt+Shift+O · vazio desativa">Atalhos globais</SectionLabel>
      <Panel className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {SHORTCUT_ACTIONS.map((action) => (
          <ShortcutField
            key={action}
            label={SHORTCUT_LABELS[action]}
            value={shortcuts[action]}
            failed={state.shortcutFailures.includes(action)}
            onCommit={(v) => void overlayUpdate({ shortcuts: { [action]: v } })}
          />
        ))}
      </Panel>
    </div>
  )
}
