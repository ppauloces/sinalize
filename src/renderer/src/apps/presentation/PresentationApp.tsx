import { useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { captionText, emptyCaption, reduceCaption } from '@/features/captions/overlay-caption'
import { usePlayerBridge } from '../player-bridge'
import { useOutputState } from '../use-output-state'

// Telão: só avatar, legenda e fundo. Nenhum controle técnico; o operador comanda pelo Studio.
export function PresentationApp() {
  const state = useOutputState()
  const frame = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => `vlibras-stage.html?avatar=${encodeURIComponent(new URLSearchParams(location.search).get('avatar') ?? 'icaro')}`)
  const [model, dispatch] = useReducer(reduceCaption, emptyCaption)
  usePlayerBridge(frame)
  useEffect(() => window.sinalize.caption.onEvent(dispatch), [])

  // O personagem pode ter mudado no Studio antes do Telão abrir.
  const character = state?.settings.avatar.character
  useEffect(() => {
    if (character) frame.current?.contentWindow?.vlibras?.setAvatar(character)
  }, [character])

  if (!state) return null
  const p = state.settings.presentation
  const last = model.finals.at(-1)
  const text = model.partial ? captionText(model, 'live').text.split(' ').slice(-24).join(' ') : last?.text

  return (
    <main className="relative flex h-full flex-col overflow-hidden" style={{ background: p.background }}>
      <div className="relative min-h-0 flex-1">
        <iframe ref={frame} src={src} title="Avatar VLibras" tabIndex={-1} className="absolute inset-0 size-full border-0 bg-transparent [color-scheme:normal]" />
      </div>
      {p.showCaptions && (
        <div aria-live="polite" className="flex shrink-0 items-center justify-center px-[6%] pb-[3vh]" style={{ minHeight: p.captionSize * 2.9 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {text && (
              <motion.p
                key={last?.seg ?? 'parcial'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="line-clamp-2 max-w-[90%] rounded-md bg-black/70 px-[0.6em] py-[0.25em] text-center leading-snug font-semibold text-white"
                style={{ fontSize: p.captionSize }}
              >
                {text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
      {p.showBranding && <span className="absolute bottom-3 left-4 text-[11px] font-semibold tracking-[0.18em] text-white/35">SINALIZE</span>}
    </main>
  )
}
