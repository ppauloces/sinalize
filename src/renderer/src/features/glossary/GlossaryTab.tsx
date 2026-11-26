import { useRef, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel, SectionLabel } from '@/components/section'
import { useStore } from '@/lib/store'
import { setStatus } from '../session/status'
import { glossaryStore, removeTerm, upsertTerm } from './glossary'

export function GlossaryTab() {
  const entries = useStore(glossaryStore)
  const termRef = useRef<HTMLInputElement>(null)

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const term = String(data.get('term') ?? '').trim()
    const expansion = String(data.get('expansion') ?? '').trim()
    if (!term || !expansion) return
    const result = upsertTerm(term, expansion)
    setStatus(result === 'updated' ? `Glossário atualizado: "${term}" → "${expansion}"` : `Adicionado ao glossário: "${term}"`, 'active')
    form.reset()
    termRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel>
        <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
          Cadastre siglas, termos técnicos ou expressões. Antes de enviar qualquer texto (voz, digitação ou frase pronta) ao VLibras, o
          sistema faz a substituição automaticamente.
        </p>
        <form className="flex flex-col gap-2.5" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="glossaryTerm">Termo / Sigla</Label>
            <Input id="glossaryTerm" name="term" ref={termRef} placeholder="Ex.: ADS, IFBA, PI" autoComplete="off" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="glossaryExpansion">Tradução / Expansão para Libras</Label>
            <Input id="glossaryExpansion" name="expansion" placeholder="Ex.: Análise e Desenvolvimento de Sistemas" autoComplete="off" required />
          </div>
          <Button type="submit" variant="brand">
            <Plus />
            Adicionar ao glossário
          </Button>
        </form>
      </Panel>

      <SectionLabel hint="Salvo automaticamente">Termos cadastrados</SectionLabel>
      {entries.length === 0 && <p className="py-2 text-center text-[0.78rem] text-muted-foreground">Nenhum termo cadastrado no glossário ainda.</p>}
      <div className="flex flex-col gap-1.5">
        {entries.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-ring/40">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[0.78rem] text-muted-foreground">
                <span className="rounded-md border border-ring/30 bg-accent px-1.5 py-px font-bold text-accent-foreground">{item.term}</span>
                <span aria-hidden="true">→</span>
              </div>
              <p className="mt-0.5 truncate text-[0.82rem]">{item.expansion}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Excluir termo"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                removeTerm(item.id)
                setStatus(`Termo removido: "${item.term}"`)
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
