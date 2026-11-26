import { useState } from 'react'
import { Eraser, Keyboard, Send } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dock } from '@/components/workspace/Dock'
import { workspace } from '../workspace/workspace-store'
import { send } from '../session/session'
import { phrasesStore } from './quick-phrases'

export function ManualDock() {
  const [text, setText] = useState('')
  const phrases = useStore(phrasesStore, (s) => s.phrases)
  const submit = () => {
    if (!text.trim()) return
    send(text)
    setText('')
  }

  return (
    <Dock
      title="Tradução manual"
      icon={Keyboard}
      actions={
        <Button variant="ghost" size="xs" className="text-fg-3" onClick={() => workspace.openSettings('translation')} title="Editar frases rápidas">
          Editar frases
        </Button>
      }
      bodyClassName="flex flex-col gap-2 p-2.5"
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Digite uma frase para sinalizar…"
        aria-label="Texto para sinalizar"
        className="min-h-9 flex-1"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex items-center gap-1.5">
        <Button variant="default" className="flex-1" disabled={!text.trim()} onClick={submit}>
          <Send /> Sinalizar texto
          <span className="ml-1 font-mono text-[10px] opacity-70">Ctrl+Enter</span>
        </Button>
        <Button size="icon" aria-label="Limpar" title="Limpar" disabled={!text} onClick={() => setText('')}>
          <Eraser />
        </Button>
      </div>
      <div role="group" className="grid grid-cols-3 gap-1" aria-label="Frases rápidas">
        {phrases.map((phrase, i) => (
          <button
            key={phrase + i}
            type="button"
            onClick={() => send(phrase, undefined, undefined, 'frase')}
            title={`${phrase} (tecla ${i + 1})`}
            className="flex h-6 min-w-0 items-center gap-1.5 rounded-sm border border-line bg-elevated px-1.5 text-left text-[11px] text-fg-2 transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          >
            <span className="font-mono text-[10px] text-fg-3">{i + 1}</span>
            <span className="truncate">{phrase}</span>
          </button>
        ))}
      </div>
    </Dock>
  )
}
