// Glossário/léxico local: substitui siglas e termos antes de qualquer texto chegar ao VLibras.
import { createStore } from 'zustand/vanilla'
import { z } from 'zod'
import { readJson, write } from '@/lib/storage'

export interface GlossaryEntry {
  id: string
  term: string
  expansion: string
}

const KEY = 'sinalize_glossary'
const DEFAULTS: GlossaryEntry[] = [
  { id: 'def-ifba', term: 'IFBA', expansion: 'Instituto Federal da Bahia' },
  { id: 'def-pi', term: 'PI', expansion: 'Projeto Interdisciplinar' },
  { id: 'def-ads', term: 'ADS', expansion: 'Análise e Desenvolvimento de Sistemas' },
]
const entrySchema = z.object({ id: z.string(), term: z.string().min(1).max(80), expansion: z.string().min(1).max(300) })

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Case-insensitive, palavra inteira com suporte a acentos; termos mais longos primeiro
// para não substituir parcialmente expressões compostas.
export function applyGlossary(text: string, entries: GlossaryEntry[]) {
  if (!text || !entries.length) return text
  return [...entries]
    .filter((e) => e.term && e.expansion)
    .sort((a, b) => b.term.length - a.term.length)
    .reduce((out, e) => out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(e.term)}(?![\\p{L}\\p{N}_])`, 'giu'), e.expansion), text)
}

function load(): GlossaryEntry[] {
  const saved = readJson<unknown>(KEY, null)
  if (Array.isArray(saved)) return saved.flatMap((e) => (entrySchema.safeParse(e).success ? [e as GlossaryEntry] : []))
  write(KEY, JSON.stringify(DEFAULTS))
  return [...DEFAULTS]
}

export const glossaryStore = createStore(() => ({ entries: load() }))
glossaryStore.subscribe(({ entries }) => write(KEY, JSON.stringify(entries)))

export const expand = (text: string) => applyGlossary(text, glossaryStore.getState().entries)

// Atualiza se o termo já existir (sem diferenciar maiúsculas), senão adiciona no topo.
export function upsertTerm(term: string, expansion: string): 'added' | 'updated' {
  const { entries } = glossaryStore.getState()
  const idx = entries.findIndex((e) => e.term.toLowerCase() === term.toLowerCase())
  if (idx !== -1) {
    glossaryStore.setState({ entries: entries.map((e, i) => (i === idx ? { ...e, term, expansion } : e)) })
    return 'updated'
  }
  glossaryStore.setState({ entries: [{ id: 'g-' + Date.now().toString(36), term, expansion }, ...entries] })
  return 'added'
}

export const removeTerm = (id: string) => glossaryStore.setState((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
