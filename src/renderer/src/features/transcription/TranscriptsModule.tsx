import { ScrollText } from 'lucide-react'
import { useStore } from 'zustand'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { TranscriptConsole } from './TranscriptConsole'
import { transcriptStore } from './transcript-store'

export function TranscriptsModule() {
  const entries = useStore(transcriptStore, (s) => s.entries)
  const finals = entries.filter((e) => e.status === 'final')
  const words = finals.reduce((n, e) => n + e.text.split(/\s+/).filter(Boolean).length, 0)
  const repaired = finals.filter((e) => e.repaired).length
  const errors = entries.filter((e) => e.status === 'error').length

  return (
    <ModuleFrame
      title="Transcrições"
      description="Histórico completo da sessão, com busca e exportação"
      icon={ScrollText}
      actions={
        <span className="font-mono text-[11px] text-fg-3">
          {finals.length} segmentos · {words} palavras · {repaired} loops corrigidos · {errors} erros
        </span>
      }
      bodyClassName="overflow-hidden"
    >
      <TranscriptConsole embedded />
    </ModuleFrame>
  )
}
