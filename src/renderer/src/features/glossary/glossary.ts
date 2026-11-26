// Glossário/léxico local: substitui siglas e termos antes de qualquer texto chegar ao VLibras.
import { createStore } from '@/lib/store'
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
  if (Array.isArray(saved)) return saved.filter((e): e is GlossaryEntry => typeof e?.term === 'string' && typeof e?.expansion === 'string')
  write(KEY, JSON.stringify(DEFAULTS))
  return [...DEFAULTS]
}

export const glossaryStore = createStore<GlossaryEntry[]>(load())
glossaryStore.subscribe(() => write(KEY, JSON.stringify(glossaryStore.get())))

export const expand = (text: string) => applyGlossary(text, glossaryStore.get())

// Atualiza se o termo já existir (sem diferenciar maiúsculas), senão adiciona no topo.
export function upsertTerm(term: string, expansion: string): 'added' | 'updated' {
  const entries = glossaryStore.get()
  const idx = entries.findIndex((e) => e.term.toLowerCase() === term.toLowerCase())
  if (idx !== -1) {
    glossaryStore.set(entries.map((e, i) => (i === idx ? { ...e, term, expansion } : e)))
    return 'updated'
  }
  glossaryStore.set([{ id: 'g-' + Date.now().toString(36), term, expansion }, ...entries])
  return 'added'
}

export const removeTerm = (id: string) => glossaryStore.set(glossaryStore.get().filter((e) => e.id !== id))
