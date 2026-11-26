import { useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Maximize, MonitorPlay, Pause, Play, PictureInPicture2, Projector, Redo2, SkipForward } from 'lucide-react'
import { useStore } from 'zustand'
import { AVATAR_LABELS, AVATARS, type AvatarName } from '../../../../shared/output'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusDot } from '@/components/workspace/StatusDot'
import { cn } from '@/lib/utils'
import { appearanceStore, monitorColor } from '../appearance/appearance-store'
import { actions, setMonitorElement } from '../command/actions'
import { outputCommand, outputStore, outputUpdate } from '../output/output-store'
import { ENGINE_LABEL } from '../session/service-status'
import { captions, queue } from '../session/session'
import { sessionStore } from '../session/session-store'
import { getPlayer, playerStore, setStageFrame } from './player'

// O src é fixado na montagem: trocar de personagem usa setAvatar sem recarregar o Unity.
// color-scheme igual ao do documento do player: senão o Chromium pinta o iframe com fundo opaco.
function StageFrame({ character, gloss }: { character: string; gloss: boolean }) {
  const [src] = useState(() => `vlibras-stage.html?subtitles=${gloss ? 1 : 0}&avatar=${character}`)
  return <iframe ref={setStageFrame} src={src} title="Avatar VLibras" tabIndex={-1} className="absolute inset-0 size-full border-0 bg-transparent [color-scheme:normal]" />
}

function ToolButton({ label, icon: Icon, onClick, active, disabled }: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-fg-2 transition-colors outline-none hover:bg-hover hover:text-fg focus-visible:ring-1 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-brand-soft text-brand-fg hover:bg-brand-soft hover:text-brand-fg',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const Divider = () => <span className="mx-1 h-4 w-px bg-line" />

function CaptionStrip() {
  const { finals, partial } = useStore(captions.store)
  const last = finals.at(-1)
  return (
    <div aria-live="polite" className="flex h-16 shrink-0 flex-col justify-center overflow-hidden border-t border-line bg-app px-4 text-center">
      {!last && !partial && <p className="text-xs text-fg-3">Legenda sincronizada aparece aqui</p>}
      <AnimatePresence initial={false} mode="popLayout">
        {last && (
          <motion.p
            key={last.seg}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            className={cn('line-clamp-2 text-[15px] leading-snug font-semibold text-fg', last.state === 'signing' && 'underline decoration-brand decoration-2 underline-offset-4')}
          >
            {last.text}
            {last.state === 'skipped' && <span className="ml-1 text-[11px] font-normal text-fg-3">(só legenda)</span>}
          </motion.p>
        )}
      </AnimatePresence>
      {partial && <p className="truncate text-xs text-fg-2 italic">{partial.text}</p>}
    </div>
  )
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex h-5 items-center gap-1.5 rounded-sm px-1.5 font-mono text-[10px] font-semibold tracking-wide', className)}>{children}</span>
}

export function Monitor() {
  const outputs = useStore(outputStore, (s) => s.state)
  const status = useStore(playerStore, (s) => s.status)
  const phase = useStore(sessionStore, (s) => s.phase)
  const { speed, items } = useStore(queue.store)
  const { monitorBackground, monitorSubtitles } = useStore(appearanceStore)
  const engine = outputs?.engine ?? 'studio'
  const character = outputs?.settings.avatar.character ?? 'icaro'
  const baseSpeed = outputs?.settings.avatar.speed ?? 2
  const lastDone = items.findLast((it) => it.state !== 'waiting' && it.state !== 'playing')

  return (
    <section ref={setMonitorElement} aria-label="Monitor de sinalização" className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2.5">
        <MonitorPlay className="size-3.5 text-fg-3" />
        <h2 className="text-[11px] font-semibold tracking-[0.07em] text-fg-2 uppercase">Monitor de sinalização</h2>
        <Badge className="bg-elevated text-fg-2">{ENGINE_LABEL[engine].toUpperCase()}</Badge>
        <div className="ml-auto flex items-center gap-1.5">
          {status === 'playing' && (
            <Badge className="bg-brand-soft text-brand-fg">
              <StatusDot tone="ok" className="bg-brand" /> SINALIZANDO
            </Badge>
          )}
          {status === 'paused' && <Badge className="bg-warning-soft text-warning">PAUSADO</Badge>}
          {status === null && <Badge className="bg-elevated text-fg-3">CARREGANDO PLAYER</Badge>}
          <span className="font-mono text-[11px] text-fg-3 tabular">{speed.toLocaleString('pt-BR')}x</span>
          {phase !== 'idle' && (
            <Badge className={phase === 'live' ? 'bg-danger-strong text-white' : 'bg-warning-soft text-warning'}>
              {phase === 'live' && <StatusDot tone="idle" className="animate-live bg-white" />}
              {phase === 'live' ? 'LIVE' : 'PAUSA'}
            </Badge>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: monitorColor(monitorBackground) }}>
        {engine === 'studio' ? (
          <StageFrame key={String(monitorSubtitles)} character={character} gloss={monitorSubtitles} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            {engine === 'presentation' ? <Projector className="size-6 text-fg-3" /> : <PictureInPicture2 className="size-6 text-fg-3" />}
            <div>
              <p className="text-sm font-medium text-fg">Avatar em execução no {ENGINE_LABEL[engine]}</p>
              <p className="mt-1 max-w-80 text-xs text-fg-3">
                Um único player VLibras fica ativo por vez. A fila, a legenda e os controles abaixo continuam operando a saída.
              </p>
            </div>
            <button type="button" onClick={() => actions.setEngine('studio')} className="rounded-md border border-line bg-elevated px-2.5 py-1 text-xs text-fg hover:bg-hover">
              Trazer o avatar para o monitor
            </button>
          </div>
        )}
      </div>

      <CaptionStrip />

      <div role="toolbar" aria-label="Controles do player" className="flex h-9 shrink-0 items-center gap-0.5 border-t border-line px-1.5">
        {status === 'paused' ? (
          <ToolButton label="Retomar sinal" icon={Play} onClick={() => getPlayer()?.resume()} />
        ) : (
          <ToolButton label="Pausar sinal" icon={Pause} disabled={status !== 'playing'} onClick={() => getPlayer()?.pause()} />
        )}
        <ToolButton label="Repetir último segmento" icon={Redo2} disabled={!lastDone} onClick={() => lastDone && queue.replay(lastDone.seg)} />
        <ToolButton label="Pular segmento atual" icon={SkipForward} disabled={status !== 'playing' && status !== 'paused'} onClick={actions.skipSign} />
        <Divider />
        <Select value={String(baseSpeed)} onValueChange={(v) => void outputUpdate({ avatar: { speed: Number(v) } })}>
          <SelectTrigger size="sm" aria-label="Velocidade base" className="w-[84px] border-transparent bg-transparent font-mono hover:bg-hover">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 1.5, 2].map((s) => (
              <SelectItem key={s} value={String(s)} className="font-mono">
                {s.toLocaleString('pt-BR')}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={character} onValueChange={(v) => void outputUpdate({ avatar: { character: v as AvatarName } })}>
          <SelectTrigger size="sm" aria-label="Personagem" className="w-[96px] border-transparent bg-transparent hover:bg-hover">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVATARS.map((a) => (
              <SelectItem key={a} value={a}>
                {AVATAR_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToolButton label="Monitor em tela cheia (F11)" icon={Maximize} onClick={actions.monitorFullscreen} />
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton label={outputs?.presentationOpen ? 'Fechar Telão' : 'Abrir Telão'} icon={Projector} active={outputs?.presentationOpen} onClick={() => void outputCommand('togglePresentation')} />
          <ToolButton label={outputs?.overlayActive ? 'Fechar Overlay' : 'Abrir Overlay'} icon={PictureInPicture2} active={outputs?.overlayActive} onClick={() => void outputCommand('toggleOverlay')} />
        </div>
      </div>
    </section>
  )
}
