import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Captions, CaptionsOff, EyeOff, Lock, Monitor, Move, MoveDiagonal2, UserCog, X } from 'lucide-react'
import { AVATAR_RATIO, type OutputState } from '../../../../shared/output'
import { usePlayerBridge } from '../player-bridge'
import { useOutputState } from '../use-output-state'
import { useDragResize } from '../use-drag-resize'

const command = window.sinalize.output.command

function Tool({ title, onClick, children, danger, drag, onPointerDown }: { title: string; onClick?: () => void; children: ReactNode; danger?: boolean; drag?: boolean; onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={
        'flex size-[26px] items-center justify-center rounded-md text-slate-200 [&_svg]:pointer-events-none [&_svg]:size-4 ' +
        (drag ? 'cursor-move [-webkit-app-region:drag] ' : 'touch-none [-webkit-app-region:no-drag] ') +
        (danger ? 'hover:bg-red-500/45' : 'hover:bg-blue-500/35 hover:text-white')
      }
    >
      {children}
    </button>
  )
}

function Toolbar({ state, onResize }: { state: OutputState; onResize: (e: ReactPointerEvent<HTMLElement>) => void }) {
  const captionHidden = !state.settings.caption.visible
  return (
    <nav aria-label="Controles do overlay" className="absolute inset-x-1.5 top-1.5 flex flex-wrap justify-center gap-px rounded-[9px] bg-slate-900/88 p-0.5 shadow-lg [-webkit-app-region:no-drag]">
      <Tool title="Mover (arraste)" drag>
        <Move />
      </Tool>
      <Tool title="Redimensionar (arraste)" onPointerDown={onResize}>
        <MoveDiagonal2 />
      </Tool>
      <Tool title="Bloquear posição e apresentar" onClick={() => void command('edit', false)}>
        <Lock />
      </Tool>
      <Tool title="Mover para o próximo monitor" onClick={() => void command('nextDisplay', 'avatar')}>
        <Monitor />
      </Tool>
      <Tool title="Configurar avatar" onClick={() => void command('focusStudio', 'avatar')}>
        <UserCog />
      </Tool>
      <Tool title="Configurar legendas" onClick={() => void command('focusStudio', 'caption')}>
        <Captions />
      </Tool>
      <Tool title="Ocultar avatar (a sinalização volta para o Studio)" onClick={() => void command('toggleAvatar')}>
        <EyeOff />
      </Tool>
      <Tool title={captionHidden ? 'Mostrar legendas' : 'Ocultar legendas'} onClick={() => void command('toggleCaption')}>
        {captionHidden ? <Captions /> : <CaptionsOff />}
      </Tool>
      <Tool title="Fechar overlay" danger onClick={() => void command('closeOverlay')}>
        <X />
      </Tool>
    </nav>
  )
}

export function AvatarOverlay() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => `vlibras-stage.html?avatar=${encodeURIComponent(new URLSearchParams(location.search).get('avatar') ?? 'icaro')}`)
  const state = useOutputState()
  const loading = usePlayerBridge(frame)
  // Redimensionamento programático (janelas transparentes no Windows não redimensionam nativamente).
  const onResize = useDragResize((dx, dy, start) => void command('resizeAvatar', Math.round(start.width + (dx + dy / AVATAR_RATIO) / 2)))

  return (
    <>
      <iframe ref={frame} src={src} title="Avatar VLibras" tabIndex={-1} className="absolute inset-0 size-full border-0 bg-transparent [color-scheme:normal]" />
      {/* Ferramentas só no modo edição: nada decorativo fica sobre os slides. */}
      {state?.editing && (
        <div className="font-sans">
          <div title="Arraste para mover" className="absolute inset-0 cursor-move rounded-[10px] border-2 border-dashed border-blue-500 bg-blue-500/7 [-webkit-app-region:drag]" />
          {loading && (
            <span className="absolute bottom-[40%] left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs whitespace-nowrap text-slate-300">
              Carregando avatar…
            </span>
          )}
          <Toolbar state={state} onResize={onResize} />
          <div
            title="Redimensionar"
            onPointerDown={onResize}
            className="absolute right-0.5 bottom-0.5 flex size-[22px] cursor-nwse-resize touch-none items-center justify-center rounded-md bg-blue-600 text-white [-webkit-app-region:no-drag]"
          >
            <MoveDiagonal2 className="pointer-events-none size-3.5" />
          </div>
        </div>
      )}
    </>
  )
}
