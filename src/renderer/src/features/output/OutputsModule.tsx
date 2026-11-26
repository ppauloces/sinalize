import { useState, type FormEvent } from 'react'
import { Lock, PictureInPicture2, Projector, RotateCcw, Save, Trash2, Unlock } from 'lucide-react'
import { useStore } from 'zustand'
import {
  AVATAR_LABELS,
  AVATARS,
  DEFAULT_ANCHOR,
  FONTS,
  type Anchor,
  type AvatarName,
  type CaptionSource,
  type FontFamily,
  type OutputPatch,
  type OutputState,
  type OverlayKind,
} from '../../../../shared/output'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusDot } from '@/components/workspace/StatusDot'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { notify } from '../notify'
import { DisplayPreview } from './DisplayPreview'
import { ColorSetting, SelectSetting, SettingsGroup, SliderSetting, SwitchSetting } from './fields'
import { outputCommand, outputStore, outputUpdate } from './output-store'

export const ANCHOR_OPTIONS: { value: Anchor; label: string; disabled?: boolean }[] = [
  { value: 'top-left', label: 'Superior esquerdo' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom-center', label: 'Inferior central' },
  { value: 'custom', label: 'Personalizado (arrastado)', disabled: true },
]

const SOURCE_OPTIONS: { value: CaptionSource; label: string }[] = [
  { value: 'live', label: 'Transcrição em tempo real' },
  { value: 'final', label: 'Texto consolidado' },
  { value: 'signing', label: 'Frase entregue ao avatar' },
]

const px = (v: number) => `${v} px`

// Trocar ancoragem ou monitor descarta a posição livre arrastada.
function placementPatch(state: OutputState, kind: OverlayKind, change: { anchor?: Anchor; displayId?: number }): OutputPatch {
  const anchor = change.anchor ?? (state.settings[kind].anchor === 'custom' ? DEFAULT_ANCHOR[kind] : state.settings[kind].anchor)
  return { [kind]: { ...change, anchor, x: null, y: null } }
}

const displayOptions = (state: OutputState) => state.displays.map((d) => ({ value: String(d.id), label: `${d.label}${d.primary ? ' (principal)' : ''}` }))

function Placement({ state, kind }: { state: OutputState; kind: OverlayKind }) {
  return (
    <>
      <SelectSetting label="Posição" value={state.settings[kind].anchor} options={ANCHOR_OPTIONS} onChange={(v) => void outputUpdate(placementPatch(state, kind, { anchor: v as Anchor }))} />
      <SelectSetting label="Monitor" value={String(state.bounds[kind].displayId)} options={displayOptions(state)} onChange={(v) => void outputUpdate(placementPatch(state, kind, { displayId: Number(v) }))} />
    </>
  )
}

function PresetBar({ state }: { state: OutputState }) {
  const [selected, setSelected] = useState('palestra')
  const preset = state.presets.find((p) => p.id === selected) ?? state.presets[0]
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    void outputCommand('savePreset', name).then(() => {
      setSelected(name)
      form.reset()
      notify.success(`Preset "${name}" salvo`)
    })
  }
  return (
    <SettingsGroup title="Presets de apresentação">
      <div className="flex gap-1.5">
        <Select value={preset?.id} onValueChange={setSelected}>
          <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Preset">
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
        <Button size="sm" disabled={!preset} onClick={() => preset && void outputCommand('applyPreset', preset.id)}>
          Aplicar
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Excluir preset" title="Excluir preset personalizado" disabled={!preset || preset.builtin} onClick={() => preset && void outputCommand('deletePreset', preset.id)}>
          <Trash2 />
        </Button>
      </div>
      <form className="flex gap-1.5" onSubmit={save}>
        <Input name="name" maxLength={40} required placeholder="Salvar configuração atual como…" aria-label="Nome do preset" className="h-6 flex-1 text-[11px]" />
        <Button type="submit" size="sm">
          <Save /> Salvar
        </Button>
      </form>
    </SettingsGroup>
  )
}

export function OverlaySettingsForm({ state }: { state: OutputState }) {
  const { avatar, caption, behavior } = state.settings
  return (
    <>
      <PresetBar state={state} />
      <SettingsGroup title="Avatar flutuante">
        <SwitchSetting label="Exibir avatar" checked={avatar.visible} onChange={(visible) => void outputUpdate({ avatar: { visible } })} />
        <SwitchSetting label="Sempre em primeiro plano" checked={avatar.alwaysOnTop} onChange={(alwaysOnTop) => void outputUpdate({ avatar: { alwaysOnTop } })} />
        <SelectSetting label="Personagem" value={avatar.character} options={AVATARS.map((a) => ({ value: a, label: AVATAR_LABELS[a] }))} onChange={(v) => void outputUpdate({ avatar: { character: v as AvatarName } })} />
        <SliderSetting label="Tamanho" value={avatar.width} min={140} max={900} step={10} format={px} onChange={(width) => void outputUpdate({ avatar: { width } })} />
        <Placement state={state} kind="avatar" />
      </SettingsGroup>
      <SettingsGroup title="Legendas flutuantes">
        <SwitchSetting label="Exibir legendas" checked={caption.visible} onChange={(visible) => void outputUpdate({ caption: { visible } })} />
        <SelectSetting
          label="Origem do texto"
          hint="O VLibras não informa o progresso sinal a sinal: a frase do avatar não é sincronizada com cada movimento."
          value={caption.source}
          options={SOURCE_OPTIONS}
          onChange={(v) => void outputUpdate({ caption: { source: v as CaptionSource } })}
        />
        <SelectSetting label="Fonte" value={caption.fontFamily} options={FONTS.map((f) => ({ value: f, label: f }))} onChange={(v) => void outputUpdate({ caption: { fontFamily: v as FontFamily } })} />
        <SelectSetting
          label="Peso"
          value={String(caption.fontWeight)}
          options={[
            { value: '400', label: 'Regular' },
            { value: '500', label: 'Médio' },
            { value: '600', label: 'Semibold' },
            { value: '700', label: 'Negrito' },
            { value: '800', label: 'Extra negrito' },
          ]}
          onChange={(v) => void outputUpdate({ caption: { fontWeight: Number(v) } })}
        />
        <SliderSetting label="Tamanho" value={caption.fontSize} min={14} max={96} step={1} format={px} onChange={(fontSize) => void outputUpdate({ caption: { fontSize } })} />
        <SliderSetting label="Largura máxima" value={caption.maxWidth} min={300} max={2400} step={20} format={px} onChange={(maxWidth) => void outputUpdate({ caption: { maxWidth } })} />
        <ColorSetting label="Cor do texto" value={caption.color} onChange={(color) => void outputUpdate({ caption: { color } })} />
        <ColorSetting label="Cor do fundo" value={caption.bgColor} onChange={(bgColor) => void outputUpdate({ caption: { bgColor } })} />
        <SliderSetting label="Opacidade do fundo" value={caption.bgOpacity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(bgOpacity) => void outputUpdate({ caption: { bgOpacity } })} />
        <SwitchSetting label="Contorno do texto" checked={caption.outline} onChange={(outline) => void outputUpdate({ caption: { outline } })} />
        <SwitchSetting label="Sombra do texto" checked={caption.shadow} onChange={(shadow) => void outputUpdate({ caption: { shadow } })} />
        <SliderSetting label="Espaçamento entre linhas" value={caption.lineHeight} min={1} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(lineHeight) => void outputUpdate({ caption: { lineHeight } })} />
        <SliderSetting label="Máximo de linhas" value={caption.maxLines} min={1} max={6} step={1} onChange={(maxLines) => void outputUpdate({ caption: { maxLines } })} />
        <SliderSetting
          label="Permanência após a fala"
          value={caption.holdMs}
          min={0}
          max={15000}
          step={500}
          format={(v) => (v ? `${v / 1000} s` : 'sempre')}
          onChange={(holdMs) => void outputUpdate({ caption: { holdMs } })}
        />
        <Placement state={state} kind="caption" />
      </SettingsGroup>
      <SettingsGroup title="Comportamento">
        <SwitchSetting label="Cliques atravessam o overlay ao apresentar" checked={behavior.clickThrough} onChange={(clickThrough) => void outputUpdate({ behavior: { clickThrough } })} />
        <SwitchSetting label="Restaurar a última posição ao abrir" checked={behavior.restoreLast} onChange={(restoreLast) => void outputUpdate({ behavior: { restoreLast } })} />
        <SwitchSetting label="Abrir o overlay ao iniciar a sessão" checked={behavior.autoStart} onChange={(autoStart) => void outputUpdate({ behavior: { autoStart } })} />
        <SwitchSetting label="Posicionar pela tela inteira" hint="Ignora a barra de tarefas ao calcular as posições." checked={behavior.useFullBounds} onChange={(useFullBounds) => void outputUpdate({ behavior: { useFullBounds } })} />
      </SettingsGroup>
    </>
  )
}

export function PresentationSettingsForm({ state }: { state: OutputState }) {
  const p = state.settings.presentation
  return (
    <SettingsGroup title="Telão">
      <SelectSetting
        label="Monitor de projeção"
        value={p.displayId === null ? 'auto' : String(p.displayId)}
        options={[{ value: 'auto', label: 'Automático (secundário, se houver)' }, ...displayOptions(state)]}
        onChange={(v) => void outputUpdate({ presentation: { displayId: v === 'auto' ? null : Number(v) } })}
      />
      <SwitchSetting label="Tela cheia" hint="Com um só monitor o Telão abre em janela para não cobrir o Studio." checked={p.fullscreen} onChange={(fullscreen) => void outputUpdate({ presentation: { fullscreen } })} />
      <ColorSetting label="Fundo" value={p.background} onChange={(background) => void outputUpdate({ presentation: { background } })} />
      <SwitchSetting label="Exibir legendas" checked={p.showCaptions} onChange={(showCaptions) => void outputUpdate({ presentation: { showCaptions } })} />
      <SliderSetting label="Tamanho da legenda" value={p.captionSize} min={18} max={120} step={1} format={px} onChange={(captionSize) => void outputUpdate({ presentation: { captionSize } })} />
      <SwitchSetting label="Identidade visual discreta" hint="Marca Sinalize no canto inferior." checked={p.showBranding} onChange={(showBranding) => void outputUpdate({ presentation: { showBranding } })} />
    </SettingsGroup>
  )
}

export function OutputsModule() {
  const state = useStore(outputStore, (s) => s.state)
  if (!state) return null
  const presenting = state.overlayActive && !state.editing

  return (
    <ModuleFrame title="Overlay e Telão" description="Saídas de apresentação do avatar e das legendas" icon={PictureInPicture2}>
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-auto flex items-center gap-1.5 text-xs text-fg-2">
            <StatusDot tone={state.overlayActive ? (presenting ? 'ok' : 'warn') : 'idle'} />
            {!state.overlayActive ? 'Overlay desligado' : presenting ? 'Overlay apresentando (cliques atravessam)' : 'Overlay em edição'}
          </span>
          <Button size="sm" onClick={() => void outputCommand('toggleOverlay')}>
            <PictureInPicture2 /> {state.overlayActive ? 'Fechar overlay' : 'Abrir overlay'}
          </Button>
          <Button size="sm" disabled={!state.overlayActive} onClick={() => void outputCommand('toggleEdit')}>
            {presenting ? <Unlock /> : <Lock />}
            {presenting ? 'Editar posições' : 'Bloquear e apresentar'}
          </Button>
          <Button size="sm" onClick={() => void outputCommand('togglePresentation')}>
            <Projector /> {state.presentationOpen ? 'Fechar Telão' : 'Abrir Telão'}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Restaurar posições padrão" title="Restaurar posições padrão" onClick={() => void outputCommand('reset')}>
            <RotateCcw />
          </Button>
        </div>
        <DisplayPreview state={state} />
        <p className="text-[11px] text-fg-3">
          Para voltar à edição com o overlay bloqueado use <kbd className="rounded-xs border border-line bg-elevated px-1 font-mono">{state.settings.shortcuts.toggleEdit || 'sem atalho'}</kbd>.
        </p>
      </div>
      <div className="px-3">
        <PresentationSettingsForm state={state} />
        <OverlaySettingsForm state={state} />
      </div>
    </ModuleFrame>
  )
}
