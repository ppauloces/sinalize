// Benchmark isolado do avatar VLibras (F1.5).
//
// Uso:  npx electron bench/avatar-bench.js
// Saída: bench/resultados/avatar-<data>.json e .csv
//
// Não usa microfone nem ASR. O tradutor remoto só é chamado na PREPARAÇÃO (texto → glosa);
// durante a medição o avatar recebe as glosas prontas via window.vlibras.play(glosa).
// Carrega o próprio renderer/avatar.html, para medir exatamente o player que o app usa.
//
// Mede por reprodução: palavras PT, tokens da glosa, tokens fora do dicionário (datilologia),
// letras soletradas, tempo até 'playing', duração da animação (status do player, amostrado por
// requestAnimationFrame), mensagens do player (postMessage), requisições de rede (webRequest),
// FPS dentro dos frames do player e uso da GPU (nvidia-smi).

const { app, BrowserWindow, session, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')
const { performance } = require('perf_hooks')

// Perfil próprio: cache e armazenamento separados do app (o teste de cache frio não apaga o do app)
app.setPath('userData', path.join(app.getPath('temp'), 'sinalize-avatar-bench'))

const now = () => performance.timeOrigin + performance.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SIGNS_URL = 'https://dicionario2.vlibras.gov.br/signs?version=2018.3.1'
const SPEEDS = [1, 1.5, 2, 2.5]
const REPS = 2

// Cenários. kind: 'gloss' = glosa escrita à mão (sinal isolado); 'pt' = texto traduzido na preparação.
const SCENARIOS = [
  { id: 'sinal-casa', kind: 'gloss', gloss: 'CASA' },
  { id: 'sinal-escola', kind: 'gloss', gloss: 'ESCOLA' },
  { id: 'sinal-professor', kind: 'gloss', gloss: 'PROFESSOR' },
  { id: 'sinal-obrigado', kind: 'gloss', gloss: 'OBRIGADO' },
  { id: 'frase-bomdia', kind: 'pt', text: 'Bom dia a todos, sejam bem-vindos.' },
  { id: 'frase-acessibilidade', kind: 'pt', text: 'Hoje vamos falar sobre acessibilidade na escola.' },
  { id: 'frase-professores', kind: 'pt', text: 'Os professores devem conhecer as necessidades dos alunos.' },
  { id: 'frase-sem-datilologia', kind: 'pt', text: 'Vamos usar o computador no projeto.' },
  { id: 'frase-com-datilologia', kind: 'pt', text: 'Vamos usar o Kubernetes no projeto.' },
  { id: 'frase-nome-proprio', kind: 'pt', text: 'Meu nome é Paulo.' },
  { id: 'frase-longa', kind: 'pt', text: 'A tecnologia pode ajudar muito na sala de aula, mas não substitui o intérprete de Libras em eventos importantes.' },
]
const SPEED_SCENARIOS = ['frase-acessibilidade', 'frase-professores', 'frase-com-datilologia']
const BLOCK_SCENARIO = 'frase-longa'
const BLOCK_SIZES = [2, 3, 5, 0] // 0 = glosa inteira em um play()

// ---------- rede ----------
const netLog = []
const pendingReq = new Map()
function watchNetwork(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    pendingReq.set(d.id, { t0: now(), url: d.url, method: d.method })
    cb({})
  })
  ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => {
    const r = pendingReq.get(d.id)
    pendingReq.delete(d.id)
    const len = Object.entries(d.responseHeaders || {}).find(([k]) => k.toLowerCase() === 'content-length')?.[1]?.[0]
    netLog.push({ t0: r?.t0 ?? now(), t1: now(), url: d.url, status: d.statusCode, fromCache: d.fromCache, bytes: len ? Number(len) : null })
  })
  // mesmo ajuste de CSP do app (main.js)
  ses.webRequest.onHeadersReceived((d, cb) => {
    const h = { ...d.responseHeaders }
    delete h['Content-Security-Policy']
    delete h['content-security-policy']
    cb({ responseHeaders: h })
  })
}

// ---------- GPU ----------
function gpuSample() {
  return new Promise((resolve) => execFile('nvidia-smi',
    ['--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'], { timeout: 1500, windowsHide: true },
    (err, out) => resolve(err ? null : out.trim().split(/,\s*/).map(Number))))
}

// ---------- página ----------
// Gravador injetado: transições de status (rAF) + todas as mensagens postMessage recebidas
const RECORDER = `(() => {
  if (window.__bench) return true
  const nowMs = () => performance.timeOrigin + performance.now()
  window.__bench = { log: [] }
  let last
  ;(function loop() {
    const s = window.vlibras?.status
    if (s !== last) { window.__bench.log.push({ t: nowMs(), type: 'status', v: s }); last = s }
    requestAnimationFrame(loop)
  })()
  window.addEventListener('message', (e) => {
    let d = e.data
    try { if (typeof d === 'string') d = JSON.parse(d) } catch {}
    window.__bench.log.push({ t: nowMs(), type: 'msg', origin: e.origin, data: d })
  })
  return true
})()`
// Contador de quadros injetado em cada frame (inclusive os do player, mesmo de outra origem)
const FPS_COUNTER = `(() => { if (!window.__frames) { window.__frames = 0; (function f(){ window.__frames++; requestAnimationFrame(f) })() } return location.href })()`

async function evalPage(win, code) {
  return win.webContents.executeJavaScript(code, true)
}

async function frameCounts(win) {
  const out = {}
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    try { out[f.url || f.name || String(f.routingId)] = await f.executeJavaScript('window.__frames || 0') } catch {}
  }
  return out
}

async function injectFps(win) {
  const urls = []
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    try { urls.push(await f.executeJavaScript(FPS_COUNTER)) } catch {}
  }
  return urls
}

async function waitIdle(win, timeoutMs = 120000) {
  const t0 = now()
  while (now() - t0 < timeoutMs) {
    const st = await evalPage(win, 'window.vlibras?.status')
    if (st === 'idle') return true
    await sleep(100)
  }
  return false
}

async function waitPlayer(win) {
  const t0 = now()
  while (now() - t0 < 180000) {
    const ok = await evalPage(win, '!!window.vlibras?.play && window.vlibras.status === "idle"')
    if (ok) return now() - t0
    await sleep(250)
  }
  throw new Error('player não carregou em 180 s')
}

// ---------- dicionário ----------
async function loadDictionary() {
  const res = await net.fetch(SIGNS_URL)
  const trie = await res.json()
  const set = new Set()
  ;(function walk(n, p) { if (n.end) set.add(p); for (const k in n.children) walk(n.children[k], p + k) })(trie.root, '')
  return set
}

function glossStats(gloss, dict) {
  const tokens = (gloss || '').split(/\s+/).filter(Boolean)
  // pontuação solta não vira sinal; tokens fora do dicionário viram datilologia (hipótese a confirmar)
  const signTokens = tokens.filter((t) => /[\p{L}\p{N}]/u.test(t))
  const unknown = signTokens.filter((t) => !dict.has(t))
  return {
    glossTokens: signTokens.length,
    dictTokens: signTokens.length - unknown.length,
    unknownTokens: unknown,
    fingerspelledChars: unknown.reduce((n, t) => n + t.replace(/[^\p{L}\p{N}]/gu, '').length, 0),
  }
}

// ---------- uma reprodução ----------
async function playOnce(win, { scenario, gloss, speed, label, dict, ptWords }) {
  await waitIdle(win)
  await evalPage(win, `window.vlibras.setSpeed(${speed})`)
  await sleep(300)
  const fps0 = await frameCounts(win)
  const logStart = await evalPage(win, 'window.__bench.log.length')
  const netStart = netLog.length
  const gpu = []
  let sampling = true
  ;(async () => { while (sampling) { const g = await gpuSample(); if (g) gpu.push(g); await sleep(500) } })()

  const tPlay = now()
  await evalPage(win, `window.vlibras.play(${JSON.stringify(gloss)})`)
  // espera começar (até 30 s) e terminar (até 180 s)
  let started = false
  for (let i = 0; i < 300 && !started; i++) {
    started = (await evalPage(win, 'window.vlibras.status')) !== 'idle'
    if (!started) await sleep(100)
  }
  await waitIdle(win, 180000)
  const tEnd = now()
  sampling = false
  const fps1 = await frameCounts(win)
  const log = (await evalPage(win, `window.__bench.log.slice(${logStart})`))
  const reqs = netLog.slice(netStart).filter((r) => r.t0 >= tPlay - 50)

  const statuses = log.filter((e) => e.type === 'status')
  const tPlaying = statuses.find((e) => e.v === 'playing')?.t ?? null
  const tIdle = statuses.findLast((e) => e.v === 'idle')?.t ?? tEnd
  const elapsedS = (tEnd - tPlay) / 1000
  const fps = Object.fromEntries(Object.entries(fps1).map(([k, v]) => [k, +((v - (fps0[k] || 0)) / elapsedS).toFixed(1)]))
  const msgs = log.filter((e) => e.type === 'msg')
  const msgCounts = {}
  for (const m of msgs) {
    const ev = m.data?.event || m.data?.type || (typeof m.data === 'string' ? m.data.slice(0, 40) : 'outro')
    msgCounts[ev] = (msgCounts[ev] || 0) + 1
  }

  return {
    scenario, label, speed, gloss, ptWords,
    ...glossStats(gloss, dict),
    startupMs: tPlaying ? Math.round(tPlaying - tPlay) : null,
    animMs: tPlaying ? Math.round(tIdle - tPlaying) : null,
    totalMs: Math.round(tIdle - tPlay),
    requests: reqs.length,
    networkRequests: reqs.filter((r) => !r.fromCache).length,
    bytes: reqs.reduce((n, r) => n + (r.bytes || 0), 0),
    reqUrls: reqs.map((r) => `${r.fromCache ? 'cache' : 'rede'} ${r.status} ${Math.round(r.t1 - r.t0)}ms ${r.url}`),
    msgCounts,
    msgs: msgs.map((m) => ({ dt: Math.round(m.t - tPlay), origin: m.origin, data: m.data })),
    statusLog: statuses.map((s) => ({ dt: Math.round(s.t - tPlay), v: s.v })),
    fps,
    gpuUtilAvg: gpu.length ? Math.round(gpu.reduce((n, g) => n + g[0], 0) / gpu.length) : null,
    vramMB: gpu.length ? Math.max(...gpu.map((g) => g[1])) : null,
  }
}

// ---------- roteiro ----------
async function main() {
  const ses = session.defaultSession
  watchNetwork(ses)
  const results = { startedAt: new Date().toISOString(), env: {}, load: {}, plays: [] }
  results.env.gpuInfo = await app.getGPUInfo('basic').catch(() => null)
  results.env.electron = process.versions.electron

  console.log('Preparação: dicionário…')
  const dict = await loadDictionary()
  results.env.dictionarySize = dict.size

  // Cache frio: limpa HTTP cache e armazenamento antes de abrir o player
  await ses.clearCache()
  await ses.clearStorageData()

  const win = new BrowserWindow({
    width: 460, height: 680, show: true, title: 'Sinalize — Benchmark do avatar',
    webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false, backgroundThrottling: false },
  })
  const tNav = now()
  const netBeforeLoad = netLog.length
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'avatar.html'))
  const readyMs = await waitPlayer(win)
  const loadReqs = netLog.slice(netBeforeLoad)
  results.load.cold = {
    readyMs: Math.round(now() - tNav), waitPlayerMs: Math.round(readyMs),
    requests: loadReqs.length, bytes: loadReqs.reduce((n, r) => n + (r.bytes || 0), 0),
    biggest: [...loadReqs].sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).slice(0, 8).map((r) => `${r.bytes} ${Math.round(r.t1 - r.t0)}ms ${r.url}`),
  }
  console.log('Player pronto (cache frio):', results.load.cold.readyMs, 'ms,', loadReqs.length, 'requisições')
  await evalPage(win, RECORDER)
  results.env.frames = await injectFps(win)

  // Preparação: glosas via tradutor (fora da medição)
  console.log('Preparação: traduzindo cenários…')
  for (const s of SCENARIOS) {
    if (s.kind === 'pt') s.gloss = await evalPage(win, `window.vlibras.translate(${JSON.stringify(s.text)})`)
    s.ptWords = s.kind === 'pt' ? (s.text.match(/\S+/g) || []).length : null
    console.log(`  ${s.id}: ${s.gloss}`)
  }
  results.scenarios = SCENARIOS
  const byId = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]))
  const run = async (s, speed, label, gloss = s.gloss) => {
    const r = await playOnce(win, { scenario: s.id, gloss, speed, label, dict, ptWords: s.ptWords })
    results.plays.push(r)
    console.log(`  [${label}] ${s.id} ${speed}x: anim ${r.animMs} ms, início ${r.startupMs} ms, rede ${r.networkRequests}/${r.requests}`)
    return r
  }

  // 1) Cache frio: 1ª reprodução de cada cenário (glosas inéditas), velocidade 1x
  console.log('1) Cache frio, 1x')
  for (const s of SCENARIOS) await run(s, 1, 'frio')

  // 2) Cache aquecido: mesmas glosas (repetidas), 1x
  console.log('2) Cache aquecido, 1x')
  for (const s of SCENARIOS) await run(s, 1, 'quente')

  // 3) Velocidades (cache aquecido)
  console.log('3) Velocidades')
  for (const id of SPEED_SCENARIOS) for (const sp of SPEEDS) for (let i = 0; i < REPS; i++) await run(byId[id], sp, `velocidade-r${i + 1}`)

  // 4) Tamanho dos blocos: a mesma glosa longa em blocos de N tokens, play() a play(), a 2x
  console.log('4) Blocos')
  const long = byId[BLOCK_SCENARIO]
  const tokens = long.gloss.split(/\s+/).filter(Boolean)
  for (const size of BLOCK_SIZES) {
    const blocks = size === 0 ? [tokens] : Array.from({ length: Math.ceil(tokens.length / size) }, (_, i) => tokens.slice(i * size, i * size + size))
    const t0 = now()
    const parts = []
    for (const [i, b] of blocks.entries()) parts.push(await run(long, 2, `bloco${size || 'inteiro'}-${i + 1}/${blocks.length}`, b.join(' ')))
    results.blocks = results.blocks || []
    results.blocks.push({
      size: size || 'inteiro', blocks: blocks.length, wallMs: Math.round(now() - t0),
      animSumMs: parts.reduce((n, p) => n + (p.animMs || 0), 0),
      startupSumMs: parts.reduce((n, p) => n + (p.startupMs || 0), 0),
    })
  }

  results.finishedAt = new Date().toISOString()
  const outDir = path.join(__dirname, 'resultados')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = results.startedAt.replace(/[:.]/g, '-').slice(0, 19)
  const base = path.join(outDir, `avatar-${stamp}`)
  fs.writeFileSync(base + '.json', JSON.stringify(results, null, 2))
  const cols = ['scenario', 'label', 'speed', 'ptWords', 'glossTokens', 'dictTokens', 'fingerspelledChars', 'startupMs', 'animMs', 'totalMs', 'requests', 'networkRequests', 'bytes', 'gpuUtilAvg', 'vramMB', 'gloss']
  const csv = [cols.join(','), ...results.plays.map((p) => cols.map((c) => JSON.stringify(p[c] ?? '')).join(','))].join('\n')
  fs.writeFileSync(base + '.csv', csv)
  console.log('Resultados:', base + '.json')
  app.quit()
}

// ---------- experimentos com métodos do PlayerManager (perguntas 5, 6 e 7) ----------
// Os métodos existem no build Unity (nomes extraídos dos metadados IL2CPP); o widget não os usa.
// Chamados pelo mesmo caminho do widget: gameInstance.SendMessage('PlayerManager', método, parâmetro),
// executado dentro do iframe do player. Nada do VLibras é modificado.
const unityFrame = (win) => win.webContents.mainFrame.framesInSubtree.find((f) => /\/unity\/index\.html/.test(f.url))
const sendUnity = (win, method, param) => unityFrame(win).executeJavaScript(
  `window.getUnityInstance().SendMessage('PlayerManager', ${JSON.stringify(method)}${param === undefined ? '' : ', ' + JSON.stringify(param)})`)

async function timeline(win, action, timeoutMs = 120000) {
  await waitIdle(win)
  const logStart = await evalPage(win, 'window.__bench.log.length')
  const netStart = netLog.length
  const t0 = now()
  await action()
  // espera começar e voltar a ficar parado por 1,5 s seguidos
  let idleSince = null
  while (now() - t0 < timeoutMs) {
    const st = await evalPage(win, 'window.vlibras.status')
    if (st === 'idle') { idleSince ??= now(); if (now() - idleSince > 1500 && now() - t0 > 1000) break } else idleSince = null
    await sleep(50)
  }
  const log = await evalPage(win, `window.__bench.log.slice(${logStart})`)
  const statuses = log.filter((e) => e.type === 'status')
  const playing = statuses.find((e) => e.v === 'playing')
  const idle = statuses.findLast((e) => e.v === 'idle')
  return {
    totalMs: playing && idle ? Math.round(idle.t - t0) : null,
    statuses: statuses.map((s) => ({ dt: Math.round(s.t - t0), v: s.v })),
    counters: log.filter((e) => e.type === 'msg' && e.data?.event === 'counter_gloss').map((m) => ({ dt: Math.round(m.t - t0), data: m.data.data })),
    net: netLog.slice(netStart).map((r) => `${r.fromCache ? 'cache' : 'rede'} ${r.status} ${Math.round(r.t0 - t0)}ms ${r.url.replace(/^https:\/\/dicionario2\.vlibras\.gov\.br/, '')}`),
  }
}

async function experiments() {
  const ses = session.defaultSession
  watchNetwork(ses)
  const out = { startedAt: new Date().toISOString(), exp: {} }
  const win = new BrowserWindow({
    width: 460, height: 680, show: true, title: 'Sinalize — Experimentos do player',
    webPreferences: { contextIsolation: false, nodeIntegration: true, webSecurity: false, backgroundThrottling: false },
  })
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'avatar.html'))
  await waitPlayer(win)
  await evalPage(win, RECORDER)
  const A = 'CASA ESCOLA'
  const B = 'PROFESSOR OBRIGADO'
  await evalPage(win, 'window.vlibras.setSpeed(1)')

  console.log('Aquecendo A e B…')
  await timeline(win, () => evalPage(win, `window.vlibras.play(${JSON.stringify(A)})`))
  await timeline(win, () => evalPage(win, `window.vlibras.play(${JSON.stringify(B)})`))

  console.log('Linha de base: A, B e "A B" num play só')
  out.exp.soA = await timeline(win, () => evalPage(win, `window.vlibras.play(${JSON.stringify(A)})`))
  out.exp.soB = await timeline(win, () => evalPage(win, `window.vlibras.play(${JSON.stringify(B)})`))
  out.exp.juntos = await timeline(win, () => evalPage(win, `window.vlibras.play(${JSON.stringify(A + ' ' + B)})`))

  console.log('play(A) e, depois de 1 s, play(B) (playNow: substitui?)')
  out.exp.playNowSobreposto = await timeline(win, async () => {
    await evalPage(win, `window.vlibras.play(${JSON.stringify(A)})`)
    await sleep(1000)
    await evalPage(win, `window.vlibras.play(${JSON.stringify(B)})`)
  })

  console.log('play(A) e, depois de 1 s, playQueued(B)')
  out.exp.playQueued = await timeline(win, async () => {
    await evalPage(win, `window.vlibras.play(${JSON.stringify(A)})`)
    await sleep(1000)
    await sendUnity(win, 'playQueued', B)
  })

  console.log('play(A) e, depois de 1 s, playIfEmpty(B)')
  out.exp.playIfEmpty = await timeline(win, async () => {
    await evalPage(win, `window.vlibras.play(${JSON.stringify(A)})`)
    await sleep(1000)
    await sendUnity(win, 'playIfEmpty', B)
  })

  console.log('playQueued(B) com o avatar parado')
  out.exp.playQueuedParado = await timeline(win, () => sendUnity(win, 'playQueued', B))

  console.log('Pré-carga: loadAssetBundle(GIRAFA), depois play(GIRAFA); controle: play(ELEFANTE) frio')
  out.exp.preloadRede = await (async () => {
    const netStart = netLog.length
    const t0 = now()
    await sendUnity(win, 'loadAssetBundle', 'GIRAFA')
    await sleep(4000)
    return netLog.slice(netStart).map((r) => `${r.fromCache ? 'cache' : 'rede'} ${r.status} ${Math.round(r.t0 - t0)}ms ${r.url}`)
  })()
  out.exp.preloadPlay = await timeline(win, () => evalPage(win, "window.vlibras.play('GIRAFA')"))
  out.exp.semPreloadPlay = await timeline(win, () => evalPage(win, "window.vlibras.play('ELEFANTE')"))

  console.log('Armazenamento dentro do iframe do player')
  out.exp.armazenamentoIframe = await unityFrame(win).executeJavaScript(`(async () => ({
    indexedDB: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'sem API',
    cacheStorage: self.caches ? await caches.keys() : 'sem API',
    origin: location.origin,
  }))()`)

  const outDir = path.join(__dirname, 'resultados')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `experimentos-${out.startedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  console.log('Resultados:', file)
  app.quit()
}

app.whenReady().then(process.argv.includes('--experimentos') ? experiments : main).catch((e) => {
  console.error(e)
  app.exit(1)
})
