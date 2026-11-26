import { describe, expect, it } from 'vitest'
import type { CaptionEvent, CaptionLineState, PlayerStatus } from '../../../shared/overlay'
import type { Player } from './avatar/player'
import { SigningQueue } from './avatar/signing-queue'
import { CaptionStore } from './captions/caption-store'
import { captionText, emptyCaption, reduceCaption } from './captions/overlay-caption'
import { applyGlossary } from './glossary/glossary'

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
    play(gloss: string) {
      p.played.push(gloss)
    },
    setSpeed(speed: number) {
      p.speed = speed
    },
    setAvatar() {},
  }
  return p satisfies Player
}

function setup() {
  const player = fakePlayer()
  const states: [string, CaptionLineState][] = []
  const events: string[] = []
  const queue = new SigningQueue({
    getPlayer: () => player,
    translate: async (t) => t.toUpperCase(),
    onCaptionState: (seg, state) => states.push([seg, state]),
    baseSpeed: () => 2,
    tel: (type, seg) => events.push(`${type}:${seg}`),
  })
  return { player, states, events, queue }
}

describe('fila de sinalização', () => {
  it('toca em ordem, marca a legenda e encadeia o próximo item', async () => {
    const { player, states, queue } = setup()
    queue.enqueue('bom dia', 's1')
    queue.enqueue('tudo bem', 's2')
    await tick(queue)
    expect(player.played).toEqual(['BOM DIA'])
    expect(player.speed).toBe(2)

    player.status = 'playing'
    await tick(queue)
    expect(states).toContainEqual(['s1', 'signing'])

    player.status = 'idle'
    await tick(queue)
    expect(states).toContainEqual(['s1', 'done'])
    expect(player.played).toEqual(['BOM DIA', 'TUDO BEM'])
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

  it('esvaziar a fila registra cada frase e marca como só legenda', async () => {
    const { states, events, queue } = setup()
    queue.enqueue('a', 's1')
    queue.enqueue('b', 's2')
    await tick(queue)
    queue.flush()
    expect(states).toContainEqual(['s2', 'skipped'])
    expect(events).toContain('drop:s2')
  })

  it('sem glosa, o player recebe o português (registrado)', async () => {
    const player = fakePlayer()
    const events: string[] = []
    const queue = new SigningQueue({
      getPlayer: () => player,
      translate: () => Promise.reject(new Error('offline')),
      onCaptionState: () => {},
      baseSpeed: () => 2,
      tel: (type) => events.push(type),
    })
    queue.enqueue('olá', 's1')
    await tick(queue)
    expect(player.played).toEqual(['olá'])
    expect(events).toContain('gloss.err')
  })
})

describe('legendas', () => {
  it('ordena finais por segmento e descarta o parcial consolidado', () => {
    const mirrored: CaptionEvent[] = []
    const captions = new CaptionStore((ev) => mirrored.push(ev))
    captions.setPartial('mic-x-2', 'dois prov')
    captions.addFinal('mic-x-3', 'três')
    captions.addFinal('mic-x-2', 'dois')
    const { finals, partial } = captions.store.get()
    expect(finals.map((f) => f.text)).toEqual(['dois', 'três'])
    expect(partial).toBeNull()
    captions.setPartial('mic-x-2', 'atrasado')
    expect(captions.store.get().partial).toBeNull()
    expect(mirrored.map((e) => e.kind)).toEqual(['partial', 'final', 'final'])
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
