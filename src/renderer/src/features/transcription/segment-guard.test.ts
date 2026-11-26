import { describe, expect, it } from 'vitest'
import { findRepetitionRuns, guardSegment } from './segment-guard'

describe('proteção contra loop de transcrição', () => {
  it('detecta e colapsa o loop relatado em produção', () => {
    const r = guardSegment('O que é que é que é que é que é que é que é que é que')
    expect(r.abnormal).toBe(true)
    expect(r.reason).toBe('repetition')
    expect(r.text).toBe('O que é que')
  })

  it('preserva o texto antes e depois do loop', () => {
    const r = guardSegment('Hoje vamos falar sobre a sobre a sobre a sobre a sobre a acessibilidade digital.')
    expect(r.abnormal).toBe(true)
    expect(r.text).toBe('Hoje vamos falar sobre a acessibilidade digital.')
  })

  it('ignora pontuação e acentos ao comparar repetições', () => {
    const r = guardSegment('Obrigado, obrigado. Obrigado! obrigado obrigado Obrigado, obrigado.')
    expect(r.abnormal).toBe(true)
    expect(r.text).toBe('Obrigado,')
  })

  it('mantém repetições naturais da fala', () => {
    for (const natural of [
      'Não, não, não, isso está errado.',
      'Vamos lá, vamos lá, vamos lá!',
      'Muito muito obrigado a todos.',
      'É que é que eu não sabia.',
      'Sejam bem-vindos. Sejam bem-vindos à apresentação de hoje.',
    ]) {
      const r = guardSegment(natural)
      expect(r.abnormal, natural).toBe(false)
      expect(r.text, natural).toBe(natural)
    }
  })

  it('sinaliza taxa de fala impossível para a duração do áudio', () => {
    const many = 'um dois três quatro cinco seis sete oito nove dez onze doze treze catorze'
    expect(guardSegment(many, 1000)).toMatchObject({ abnormal: true, reason: 'rate' })
    expect(guardSegment(many, 6000).abnormal).toBe(false)
  })

  it('escolhe o n-grama que cobre mais palavras', () => {
    const runs = findRepetitionRuns('a b c a b c a b c a b c'.split(' '))
    expect(runs).toEqual([{ start: 0, size: 3, count: 4 }])
  })

  it('texto vazio é seguro', () => {
    expect(guardSegment('   ')).toMatchObject({ text: '', abnormal: false, coverage: 0 })
  })
})
