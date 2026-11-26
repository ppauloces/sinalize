import { useMemo, useRef, useState, type FormEvent } from 'react'
import { BookA, Plus, Search, Trash2 } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/workspace/Dock'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { notify } from '../notify'
import { applyGlossary, glossaryStore, removeTerm, upsertTerm } from './glossary'

export function GlossaryModule() {
  const entries = useStore(glossaryStore, (s) => s.entries)
  const [query, setQuery] = useState('')
  const [sample, setSample] = useState('')
  const termRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? entries.filter((e) => e.term.toLowerCase().includes(q) || e.expansion.toLowerCase().includes(q)) : entries
  }, [entries, query])

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const term = String(data.get('term') ?? '').trim()
    const expansion = String(data.get('expansion') ?? '').trim()
    if (!term || !expansion) return
    notify.success(upsertTerm(term, expansion) === 'updated' ? `Termo atualizado: ${term}` : `Termo adicionado: ${term}`)
    form.reset()
    termRef.current?.focus()
  }

  return (
    <ModuleFrame
      title="Glossário e léxico"
      description="Siglas e termos substituídos antes de qualquer texto chegar ao VLibras"
      icon={BookA}
      actions={<span className="font-mono text-[11px] text-fg-3">{entries.length} termos</span>}
      bodyClassName="flex flex-col overflow-hidden"
    >
      <form onSubmit={submit} className="grid shrink-0 grid-cols-[1fr_2fr_auto] gap-2 border-b border-line p-3">
        <Input name="term" ref={termRef} placeholder="Termo ou sigla (ex.: ADS)" aria-label="Termo ou sigla" autoComplete="off" required maxLength={80} />
        <Input name="expansion" placeholder="Expansão para Libras (ex.: Análise e Desenvolvimento de Sistemas)" aria-label="Expansão" autoComplete="off" required maxLength={300} />
        <Button type="submit" variant="default">
          <Plus /> Adicionar
        </Button>
      </form>

      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-fg-3" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar termos" aria-label="Filtrar termos" className="pl-6" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!visible.length ? (
          <EmptyState icon={BookA} title={query ? 'Nenhum termo encontrado' : 'Glossário vazio'}>
            Cadastre siglas e termos técnicos para que o avatar não os soletre letra por letra.
          </EmptyState>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel text-left text-[10px] tracking-wider text-fg-3 uppercase">
              <tr className="border-b border-line">
                <th className="w-48 px-3 py-1.5 font-medium">Termo</th>
                <th className="px-3 py-1.5 font-medium">Expansão</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="group border-b border-line/60 hover:bg-hover">
                  <td className="px-3 py-1.5 font-mono font-medium text-fg">{e.term}</td>
                  <td className="px-3 py-1.5 text-fg-2">{e.expansion}</td>
                  <td className="pr-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remover ${e.term}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
                      onClick={() => {
                        removeTerm(e.id)
                        notify.info(`Termo removido: ${e.term}`)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <label className="mb-1 block text-[10px] tracking-wider text-fg-3 uppercase" htmlFor="glossary-test">
          Testar substituição
        </label>
        <Input id="glossary-test" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Digite uma frase com siglas cadastradas" />
        {sample && <p className="mt-1.5 text-xs text-fg-2">→ {applyGlossary(sample, entries)}</p>}
      </div>
    </ModuleFrame>
  )
}
