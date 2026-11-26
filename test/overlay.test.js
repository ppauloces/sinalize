const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveBounds, anchorPosition } = require('../main/display')
const S = require('../main/overlay-settings')

// Layout real da máquina de desenvolvimento: secundário à esquerda, escala diferente.
const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } }
const left = { id: 2, bounds: { x: -1536, y: 0, width: 1536, height: 864 }, workArea: { x: -1536, y: 0, width: 1536, height: 816 } }
const displays = [primary, left]
const fixed = (w, h) => () => ({ width: w, height: h })

test('ancoragens respeitam margem e área útil', () => {
  assert.deepEqual(anchorPosition('bottom-right', { width: 300, height: 400 }, primary.workArea), { x: 1596, y: 608 })
  assert.deepEqual(anchorPosition('bottom-center', { width: 1000, height: 100 }, primary.workArea), { x: 460, y: 908 })
  assert.deepEqual(anchorPosition('top-left', { width: 10, height: 10 }, left.workArea), { x: -1512, y: 24 })
})

test('posição livre no monitor secundário é preservada', () => {
  const b = resolveBounds({ anchor: 'custom', x: -1000, y: 200 }, fixed(300, 400), displays, primary)
  assert.deepEqual(b, { x: -1000, y: 200, width: 300, height: 400, displayId: 2 })
})

test('monitor desconectado: posição salva nunca fica fora das telas', () => {
  const b = resolveBounds({ anchor: 'custom', x: -1000, y: 200, displayId: 2 }, fixed(300, 400), [primary], primary)
  assert.equal(b.displayId, 1)
  assert.ok(b.x >= 0 && b.x + b.width <= 1920 && b.y >= 0 && b.y + b.height <= 1032)
})

test('posição parcialmente fora da tela é puxada para dentro', () => {
  const b = resolveBounds({ anchor: 'custom', x: 1800, y: 900 }, fixed(300, 400), displays, primary)
  assert.deepEqual([b.x, b.y], [1620, 632])
})

test('monitor escolhido por id e área completa quando pedido', () => {
  const b = resolveBounds({ anchor: 'bottom-center', displayId: 2 }, fixed(1000, 100), displays, primary, { useFullBounds: true })
  assert.deepEqual([b.x, b.y, b.displayId], [-1268, 740, 2])
})

test('sanitize rejeita tipos, enums e faixas inválidas', () => {
  const s = S.sanitize({
    avatar: { width: 99999, character: 'hacker', anchor: 'top-left', x: 'a' },
    caption: { color: 'red', bgColor: '#ABCDEF', fontSize: '40', maxLines: 3 },
    shortcuts: { toggleMic: 'Ctrl+Shift+M; rm -rf', toggleEdit: '' },
    __proto__: { polluted: true },
  })
  assert.equal(s.avatar.width, 900)
  assert.equal(s.avatar.character, 'icaro')
  assert.equal(s.avatar.anchor, 'top-left')
  assert.equal(s.avatar.x, null)
  assert.equal(s.caption.color, '#ffffff')
  assert.equal(s.caption.bgColor, '#abcdef')
  assert.equal(s.caption.fontSize, 32)
  assert.equal(s.caption.maxLines, 3)
  assert.equal(s.shortcuts.toggleMic, S.DEFAULTS.shortcuts.toggleMic)
  assert.equal(s.shortcuts.toggleEdit, '')
  assert.equal({}.polluted, undefined)
})

test('aceleradores: exige modificador real e teclas conhecidas', () => {
  for (const ok of ['Ctrl+Alt+Shift+O', 'CommandOrControl+F9', 'Alt+Space', 'Ctrl+Plus']) assert.ok(S.isAccelerator(ok), ok)
  for (const bad of ['Ctrl+Nada+X', 'Shift+A', 'A', 'Ctrl+Ctrl+A', 'Ctrl+', 'Ctrl+Shift+M; rm -rf']) assert.ok(!S.isAccelerator(bad), bad)
})

test('patch parcial mantém o restante da configuração atual', () => {
  const current = S.sanitize({ caption: { fontSize: 40 } })
  const next = S.sanitize({ caption: { color: '#00ff00' }, avatar: { x: 10, y: 20, anchor: 'custom' } }, current)
  assert.equal(next.caption.fontSize, 40)
  assert.equal(next.caption.color, '#00ff00')
  assert.deepEqual([next.avatar.x, next.avatar.y], [10, 20])
  assert.equal(S.sanitize({ avatar: { x: null } }, next).avatar.x, null)
})

test('presets: embutidos reancoram, personalizados guardam o estado', () => {
  let s = S.sanitize({ avatar: { anchor: 'custom', x: 5, y: 5 } })
  s = S.applyPreset(s, 'somente-legendas')
  assert.equal(s.avatar.visible, false)
  assert.equal(s.avatar.x, null)
  s = S.savePreset(S.sanitize({ caption: { fontSize: 50 } }, s), 'Meu evento')
  s = S.applyPreset(S.applyPreset(s, 'palestra'), 'Meu evento')
  assert.equal(s.caption.fontSize, 50)
  assert.equal(S.sanitize({ customPresets: { palestra: {} } }).customPresets.palestra, undefined)
  assert.deepEqual(S.deletePreset(s, 'Meu evento').customPresets, {})
})

test('tamanhos derivados: avatar proporcional, legenda pelas linhas', () => {
  assert.deepEqual(S.avatarSize({ width: 320 }), { width: 320, height: 420 })
  const c = S.captionSize({ ...S.DEFAULTS.caption, maxWidth: 2000 }, 1500)
  assert.equal(c.width, 1500)
  assert.equal(c.height, Math.ceil(32 * 1.3 * 2 + 11 * 2 + 16))
})
