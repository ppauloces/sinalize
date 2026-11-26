import { actions } from '@/features/command/actions'
import { send } from '@/features/session/session'
import { phrasesStore } from '@/features/translation/quick-phrases'

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable], [role="combobox"], [role="slider"], [role="menu"], [cmdk-root]')

// Atalhos do Studio (os globais, que funcionam com outro app em foco, ficam no processo principal).
export function bindStudioShortcuts() {
  const onKey = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && !e.shiftKey && key === 'k') return (e.preventDefault(), actions.openPalette())
    if (ctrl && !e.shiftKey && key === ',') return (e.preventDefault(), actions.openSettings())
    if (ctrl && e.shiftKey && key === 'enter') return (e.preventDefault(), actions.startOrStop())
    if (ctrl && e.shiftKey && key === 'p') return (e.preventDefault(), actions.togglePause())
    if (ctrl && e.shiftKey && key === 'd') return (e.preventDefault(), actions.openModule('diagnostics'))
    if (e.key === 'F11') return (e.preventDefault(), actions.monitorFullscreen())
    if (ctrl || e.altKey || typing(e.target)) return
    const phrase = phrasesStore.getState().phrases[Number(e.key) - 1]
    if (phrase && /^[1-9]$/.test(e.key)) {
      e.preventDefault()
      send(phrase, undefined, undefined, 'frase')
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
