import { describe, expect, it } from 'vitest'
import { anchorPosition, resolveBounds, type DisplayLike } from './display'
import * as S from './overlay-settings'

// Layout real da máquina de desenvolvimento: secundário à esquerda, escala diferente.
const primary: DisplayLike = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } }
const left: DisplayLike = { id: 2, bounds: { x: -1536, y: 0, width: 1536, height: 864 }, workArea: { x: -1536, y: 0, width: 1536, height: 816 } }
const displays = [primary, left]
const fixed = (width: number, height: number) => () => ({ width, height })
const custom = (x: number, y: number, displayId: number | null = null) => ({ anchor: 'custom' as const, x, y, displayId })

describe('geometria multi-monitor', () => {
  it('ancoragens respeitam margem e área útil', () => {
    expect(anchorPosition('bottom-right', { width: 300, height: 400 }, primary.workArea)).toEqual({ x: 1596, y: 608 })
    expect(anchorPosition('bottom-center', { width: 1000, height: 100 }, primary.workArea)).toEqual({ x: 460, y: 908 })
    expect(anchorPosition('top-left', { width: 10, height: 10 }, left.workArea)).toEqual({ x: -1512, y: 24 })
  })

  it('posição livre no monitor secundário é preservada', () => {
    expect(resolveBounds(custom(-1000, 200), fixed(300, 400), displays, primary)).toEqual({ x: -1000, y: 200, width: 300, height: 400, displayId: 2 })
  })

  it('monitor desconectado: posição salva nunca fica fora das telas', () => {
    const b = resolveBounds(custom(-1000, 200, 2), fixed(300, 400), [primary], primary)
    expect(b.displayId).toBe(1)
    expect(b.x >= 0 && b.x + b.width <= 1920 && b.y >= 0 && b.y + b.height <= 1032).toBe(true)
  })

  it('posição parcialmente fora da tela é puxada para dentro', () => {
    const b = resolveBounds(custom(1800, 900), fixed(300, 400), displays, primary)
    expect([b.x, b.y]).toEqual([1620, 632])
  })

  it('monitor escolhido por id e área completa quando pedido', () => {
    const b = resolveBounds({ anchor: 'bottom-center', displayId: 2, x: null, y: null }, fixed(1000, 100), displays, primary, { useFullBounds: true })
    expect([b.x, b.y, b.displayId]).toEqual([-1268, 740, 2])
  })
})

describe('configurações do overlay', () => {
  it('sanitize rejeita tipos, enums e faixas inválidas', () => {
    const s = S.sanitize(JSON.parse(`{
      "avatar": { "width": 99999, "character": "hacker", "anchor": "top-left", "x": "a" },
      "caption": { "color": "red", "bgColor": "#ABCDEF", "fontSize": "40", "maxLines": 3 },
      "shortcuts": { "toggleMic": "Ctrl+Shift+M; rm -rf", "toggleEdit": "" },
      "__proto__": { "polluted": true }
    }`))
    expect(s.avatar).toMatchObject({ width: 900, character: 'icaro', anchor: 'top-left', x: null })
    expect(s.caption).toMatchObject({ color: '#ffffff', bgColor: '#abcdef', fontSize: 32, maxLines: 3 })
    expect(s.shortcuts.toggleMic).toBe(S.DEFAULTS.shortcuts.toggleMic)
    expect(s.shortcuts.toggleEdit).toBe('')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('aceleradores: exige modificador real e teclas conhecidas', () => {
    for (const ok of ['Ctrl+Alt+Shift+O', 'CommandOrControl+F9', 'Alt+Space', 'Ctrl+Plus']) expect(S.isAccelerator(ok), ok).toBe(true)
    for (const bad of ['Ctrl+Nada+X', 'Shift+A', 'A', 'Ctrl+Ctrl+A', 'Ctrl+', 'Ctrl+Shift+M; rm -rf']) expect(S.isAccelerator(bad), bad).toBe(false)
  })

  it('patch parcial mantém o restante da configuração atual', () => {
    const current = S.sanitize({ caption: { fontSize: 40 } })
    const next = S.sanitize({ caption: { color: '#00ff00' }, avatar: { x: 10, y: 20, anchor: 'custom' } }, current)
    expect(next.caption.fontSize).toBe(40)
    expect(next.caption.color).toBe('#00ff00')
    expect([next.avatar.x, next.avatar.y]).toEqual([10, 20])
    expect(S.sanitize({ avatar: { x: null } }, next).avatar.x).toBeNull()
  })

  it('presets: embutidos reancoram, personalizados guardam o estado', () => {
    let s = S.sanitize({ avatar: { anchor: 'custom', x: 5, y: 5 } })
    s = S.applyPreset(s, 'somente-legendas')
    expect(s.avatar.visible).toBe(false)
    expect(s.avatar.x).toBeNull()
    s = S.savePreset(S.sanitize({ caption: { fontSize: 50 } }, s), 'Meu evento')
    s = S.applyPreset(S.applyPreset(s, 'palestra'), 'Meu evento')
    expect(s.caption.fontSize).toBe(50)
    expect(S.sanitize({ customPresets: { palestra: {} } }).customPresets.palestra).toBeUndefined()
    expect(S.deletePreset(s, 'Meu evento').customPresets).toEqual({})
    expect(S.applyPreset(s, 'constructor')).toBe(s)
  })

  it('tamanhos derivados: avatar proporcional, legenda pelas linhas', () => {
    expect(S.avatarSize({ width: 320 })).toEqual({ width: 320, height: 420 })
    const c = S.captionSize({ ...S.DEFAULTS.caption, maxWidth: 2000 }, 1500)
    expect(c).toEqual({ width: 1500, height: Math.ceil(32 * 1.3 * 2 + 11 * 2 + 16) })
  })
})
