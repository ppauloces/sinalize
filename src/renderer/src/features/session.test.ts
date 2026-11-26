import { describe, expect, it } from 'vitest'
import type { CaptionEvent, CaptionLineState, PlayerStatus } from '../../../shared/output'
import type { Player } from './avatar/player'
import { CaptionStore, MAX_CAPTION_CHARS } from './captions/caption-store'
import { captionText, emptyCaption, reduceCaption } from './captions/overlay-caption'
import { applyGlossary } from './glossary/glossary'
import { transcript, transcriptStore } from './transcription/transcript-store'
import { SigningQueue } from './translation/signing-queue'

// O enqueue já dispara o pump; espera a tradução assíncrona e o play.
const settle = () => new Promise((r) => setTimeout(r, 0))
const tick = async (queue: SigningQueue) => {
  await queue.pump()
  await settle()
}

function fakePlayer() {
  const p = {
    status: 'idle' as PlayerStatus | null,
    speed: null as number | null,
    played: [] as string[],
    stopped: 0,
    play(gloss: string) {
      p.played.push(gloss)
    },
    setSpeed(speed: number) {
      p.speed = speed
    },
    setAvatar() {},
    pause() {},
    resume() {},
    stop() {
      p.stopped++
    },
  }
  return p satisfies Player
}

function setup(translate: (t: string) => Promise<string> = async (t) => t.toUpperCase()) {
  const player = fakePlayer()
  const states: [string, CaptionLineState][] = []
  const events: string[] = []
  let n = 0
  const queue = new SigningQueue({
    getPlayer: () => player,
    translate,
    onCaptionState: (seg, state) => states.push([seg, state]),
    baseSpeed: () => 2,
    newSeg: () => `rep-${++n}`,
    tel: (type, seg) => events.push(`${type}:${seg}`),
  })
  const itemState = (seg: string) => queue.store.getState().items.find((it) => it.seg === seg)?.state
  return { player, states, events, queue, itemState }
}

describe('fila de sinalização', () => {
  it('toca em ordem, marca legenda e itens e encadeia o próximo', async () => {
    const { player, states, queue, itemState } = setup()
    queue.enqueue('bom dia', 's1')
    queue.enqueue('tudo bem', 's2')
    await tick(queue)
    expect(player.played).toEqual(['BOM DIA'])
    expect(player.speed).toBe(2)

    player.status = 'playing'
    await tick(queue)
    expect(states).toContainEqual(['s1', 'signing'])
    expect(itemState('s1')).toBe('playing')

    player.status = 'idle'
    await tick(queue)
    expect(itemState('s1')).toBe('done')
    expect(player.played).toEqual(['BOM DIA', 'TUDO BEM'])
  })

  it('o mesmo segmento nunca entra duas vezes (idempotência)', async () => {
    const { queue, events } = setup()
    queue.enqueue('olá', 's1')
    queue.enqueue('olá', 's1')
    expect(queue.store.getState().items).toHaveLength(1)
    expect(events).toContain('queue.duplicate:s1')
  })

  it('protege a fila contra segmentos gigantes', () => {
    const { queue, events } = setup()
    queue.enqueue(Array.from({ length: 200 }, (_, i) => `p${i}`).join(' '), 's1')
    expect(queue.store.getState().items[0]?.text.split(' ')).toHaveLength(80)
    expect(events).toContain('queue.truncated:s1')
  })

  it('troca de motor devolve a frase em curso para a frente da fila', async () => {
    const { player, states, events, queue } = setup()
    queue.enqueue('primeira', 's1')
    queue.enqueue('segunda', 's2')
    await tick(queue)
    queue.requeueCurrent('overlay')
    expect(states).toContainEqual(['s1', 'pending'])
    expect(events).toContain('requeue:s1')
    await tick(queue)
    expect(player.played).toEqual(['PRIMEIRA', 'PRIMEIRA'])
  })

  it('pular, cancelar, esvaziar e repetir', async () => {
    const { player, queue, itemState, events } = setup()
    queue.enqueue('um', 's1')
    queue.enqueue('dois', 's2')
    queue.enqueue('três', 's3')
    queue.enqueue('quatro', 's4')
    await tick(queue)
    player.status = 'playing'
    await tick(queue)
    queue.skipCurrent()
    expect(player.stopped).toBe(1)
    expect(itemState('s1')).toBe('skipped')
    queue.cancel('s3')
    expect(itemState('s3')).toBe('skipped')
    queue.flush()
    expect(itemState('s2')).toBe('skipped')
    expect(itemState('s4')).toBe('skipped')
    expect(events).toContain('drop:s4')
    queue.replay('s1')
    expect(queue.store.getState().items.at(-1)).toMatchObject({ seg: 'rep-1', text: 'um', source: 'repetição', state: 'waiting' })
  })

  it('sem glosa, o player recebe o português (registrado e marcado)', async () => {
    const { player, queue, events } = setup(() => Promise.reject(new Error('offline')))
    queue.enqueue('olá', 's1')
    await tick(queue)
    expect(player.played).toEqual(['olá'])
    expect(events).toContain('gloss.err:s1')
    expect(queue.store.getState().items[0]?.glossFallback).toBe(true)
  })
})

describe('transcrição: revisões e idempotência', () => {
  it('parcial atrasado ou após o final nunca sobrescreve o texto consolidado', () => {
    transcript.clear()
    transcript.voice('m1')
    expect(transcript.partial('m1', 'o que', 2)).toBe(true)
    expect(transcript.partial('m1', 'o', 1)).toBe(false)
    expect(transcript.final('m1', 'O que é isso?')).toBe(true)
    expect(transcript.final('m1', 'O que é isso?')).toBe(false)
    expect(transcript.partial('m1', 'o que é que é', 3)).toBe(false)
    expect(transcriptStore.getState().entries).toMatchObject([{ seg: 'm1', status: 'final', text: 'O que é isso?' }])
  })
})

describe('legendas', () => {
  it('ordena finais por segmento e descarta o parcial consolidado', () => {
    const mirrored: CaptionEvent[] = []
    const captions = new CaptionStore((ev) => mirrored.push(ev))
    captions.setPartial('mic-x-2', 'dois prov')
    captions.addFinal('mic-x-3', 'três')
    captions.addFinal('mic-x-2', 'dois')
    const { finals, partial } = captions.store.getState()
    expect(finals.map((f) => f.text)).toEqual(['dois', 'três'])
    expect(partial).toBeNull()
    captions.setPartial('mic-x-2', 'atrasado')
    expect(captions.store.getState().partial).toBeNull()
    expect(mirrored.map((e) => e.kind)).toEqual(['partial', 'final', 'final'])
  })

  it('limita o tamanho visual de cada frase', () => {
    const captions = new CaptionStore()
    captions.addFinal('s1', 'x'.repeat(1000))
    expect(captions.store.getState().finals[0]?.text.length).toBe(MAX_CAPTION_CHARS + 1)
  })

  it('janela flutuante: três origens de texto', () => {
    let m = reduceCaption(emptyCaption, { kind: 'final', seg: 's1', text: 'bom dia' })
    m = reduceCaption(m, { kind: 'partial', seg: 's2', text: 'a todos' })
    expect(captionText(m, 'live')).toEqual({ text: 'bom dia a todos', ended: true })
    expect(captionText(m, 'final').text).toBe('bom dia')
    expect(captionText(m, 'signing').text).toBe('')
    m = reduceCaption(m, { kind: 'state', seg: 's1', state: 'signing' })
    expect(captionText(m, 'signing')).toEqual({ text: 'bom dia', ended: false })
    m = reduceCaption(m, { kind: 'state', seg: 's1', state: 'done' })
    expect(captionText(m, 'signing')).toEqual({ text: 'bom dia', ended: true })
  })
})

describe('glossário', () => {
  const entries = [
    { id: '1', term: 'PI', expansion: 'Projeto Interdisciplinar' },
    { id: '2', term: 'IFBA', expansion: 'Instituto Federal da Bahia' },
    { id: '3', term: 'IFBA Campus', expansion: 'campus do instituto' },
  ]

  it('substitui palavra inteira, sem diferenciar maiúsculas, termo mais longo primeiro', () => {
    expect(applyGlossary('o pi do ifba e a api', entries)).toBe('o Projeto Interdisciplinar do Instituto Federal da Bahia e a api')
    expect(applyGlossary('IFBA Campus Salvador', entries)).toBe('campus do instituto Salvador')
    expect(applyGlossary('PIé', entries)).toBe('PIé')
  })
})
