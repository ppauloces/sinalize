import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { launchStudio, setViewport, waitPlayerReady, windowByUrl } from './electron-app'

const SHOTS = path.resolve(__dirname, '../docs/screenshots')
const FAKE_MIC = path.resolve(__dirname, 'fixtures/fala-ptbr.wav')
const RESOLUTIONS = [
  [1024, 768],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
] as const

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
const setTheme = (page: Page, theme: 'dark' | 'light') => page.evaluate((t) => document.documentElement.classList.toggle('dark', t === 'dark'), theme)
const openModule = (page: Page, name: string) => page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name, exact: true }).click()

async function localServerOnline() {
  try {
    return (await fetch('http://localhost:8000/health', { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    return false
  }
}

// Violações graves de acessibilidade no Studio (o iframe de terceiros do VLibras fica de fora).
async function seriousViolations(page: Page) {
  // Modo legado: o Electron não permite abrir a página auxiliar que o axe usa para consolidar frames.
  const result = await new AxeBuilder({ page }).setLegacyMode(true).exclude('iframe').analyze()
  return result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.length} nó(s) — ${v.nodes[0]?.target.join(' ')}`)
}

test('workspace principal: layout, acessibilidade e capturas por resolução e tema', async () => {
  const { app, studio } = await launchStudio()
  const errors: string[] = []
  studio.on('pageerror', (e) => errors.push(e.message))

  await expect(studio.getByRole('region', { name: 'Monitor de sinalização' })).toBeVisible()
  for (const dock of ['Controle de sessão', 'Mixer de áudio', 'Fila de sinalização', 'Tradução manual', 'Transcrição em tempo real']) {
    await expect(studio.getByRole('region', { name: dock })).toBeVisible()
  }
  await waitPlayerReady(studio)

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(studio, theme)
    expect(await seriousViolations(studio), `axe (${theme})`).toEqual([])
    for (const [w, h] of RESOLUTIONS) {
      await setViewport(studio, w, h)
      // Nada pode gerar rolagem global: cada dock rola por conta própria.
      expect(await studio.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await shot(studio, `studio-${w}x${h}-${theme}`)
    }
  }
  expect(errors).toEqual([])
  await app.close()
})

test('sinalização manual: frase rápida passa pela fila, chega ao avatar e aparece no histórico', async () => {
  const { app, studio } = await launchStudio()
  await setViewport(studio, 1920, 1080)
  await waitPlayerReady(studio)

  await studio.getByRole('group', { name: 'Frases rápidas' }).getByRole('button', { name: /Muito obrigado/ }).click()
  const queue = studio.getByRole('region', { name: 'Fila de sinalização' })
  await expect(queue.getByText('Muito obrigado')).toBeVisible()
  await expect(queue.getByLabel('Sinalizando')).toBeVisible({ timeout: 30_000 })
  await shot(studio, 'studio-sinalizando')
  await expect(queue.getByLabel('Concluído')).toBeVisible({ timeout: 60_000 })

  await studio.getByLabel('Texto para sinalizar').fill('Bem-vindos ao Sinalize')
  await studio.getByLabel('Texto para sinalizar').press('Control+Enter')
  await expect(queue.getByText('Bem-vindos ao Sinalize')).toBeVisible()

  await openModule(studio, 'Histórico')
  await expect(studio.getByRole('cell', { name: 'Muito obrigado' })).toBeVisible()
  await shot(studio, 'modulo-historico')
  await app.close()
})

test('módulos, configurações e paleta de comandos', async () => {
  const { app, studio } = await launchStudio()
  await setViewport(studio, 1920, 1080)

  await openModule(studio, 'Glossário e léxico')
  await studio.getByLabel('Termo ou sigla').fill('TCC')
  await studio.getByLabel('Expansão').fill('Trabalho de Conclusão de Curso')
  await studio.getByRole('button', { name: 'Adicionar' }).click()
  await studio.getByLabel('Testar substituição').fill('Apresentação do TCC')
  await expect(studio.getByText('→ Apresentação do Trabalho de Conclusão de Curso')).toBeVisible()
  await shot(studio, 'modulo-glossario')

  for (const [module, file] of [
    ['Áudio', 'modulo-audio'],
    ['Transcrições', 'modulo-transcricoes-vazio'],
    ['Overlay e Telão', 'modulo-overlay-telao'],
    ['Diagnóstico', 'modulo-diagnostico'],
  ] as const) {
    await openModule(studio, module)
    await studio.waitForTimeout(600)
    expect(await seriousViolations(studio), module).toEqual([])
    await shot(studio, file)
  }

  await studio.keyboard.press('Control+,')
  const settings = studio.getByRole('dialog')
  for (const [category, file] of [
    ['Reconhecimento de voz', 'config-reconhecimento'],
    ['Telão', 'config-telao'],
    ['Atalhos', 'config-atalhos'],
  ] as const) {
    await settings.getByRole('button', { name: category, exact: true }).click()
    await shot(studio, file)
  }
  expect(await seriousViolations(studio), 'configurações').toEqual([])
  await studio.keyboard.press('Escape')

  await studio.keyboard.press('Control+K')
  await studio.getByPlaceholder('Buscar ação, módulo ou frase…').fill('workspace')
  await shot(studio, 'paleta-comandos')
  await studio.getByRole('option', { name: 'Workspace: Compacto' }).click()
  await expect(studio.getByRole('region', { name: 'Mixer de áudio' })).toHaveCount(0)
  await shot(studio, 'workspace-compacto')
  await app.close()
})

test('Telão e Overlay: janelas independentes com uma única instância do player', async () => {
  const { app, studio } = await launchStudio()
  await setViewport(studio, 1920, 1080)
  await waitPlayerReady(studio)

  await studio.getByRole('button', { name: 'Abrir Telão' }).click()
  const telao = await windowByUrl(app, 'presentation.html')
  await expect(studio.getByText('Avatar em execução no Telão')).toBeVisible()
  // O Studio libera o próprio Unity: só o Telão renderiza o avatar.
  await expect(studio.locator('iframe[title="Avatar VLibras"]')).toHaveCount(0)
  await telao.waitForFunction(() => document.querySelector<HTMLIFrameElement>('iframe')?.contentWindow?.vlibras?.status === 'idle', null, { timeout: 60_000 })
  await studio.getByRole('group', { name: 'Frases rápidas' }).getByRole('button', { name: /Olá, bom dia/ }).click()
  await expect(telao.getByText('Olá, bom dia')).toBeVisible()
  await telao.waitForTimeout(1500)
  await shot(telao, 'telao')
  await shot(studio, 'studio-saida-telao')

  await studio.getByRole('button', { name: 'Abrir Overlay' }).click()
  // Telão ativo tem prioridade: o overlay abre só com a legenda.
  const caption = await windowByUrl(app, 'caption-overlay.html')
  await expect(caption.getByText(/Olá, bom dia|Exemplo de legenda/)).toBeVisible()
  await studio.getByRole('button', { name: 'Fechar Telão' }).click()
  const avatar = await windowByUrl(app, 'avatar-overlay.html')
  await expect(avatar.getByRole('navigation', { name: 'Controles do overlay' })).toBeVisible()
  await avatar.waitForFunction(() => document.querySelector<HTMLIFrameElement>('iframe')?.contentWindow?.vlibras?.status === 'idle', null, { timeout: 60_000 })
  await shot(avatar, 'overlay-avatar-edicao')
  await shot(caption, 'overlay-legenda-edicao')

  await studio.getByRole('button', { name: 'Fechar Overlay' }).click()
  await expect(studio.locator('iframe[title="Avatar VLibras"]')).toHaveCount(1)
  await app.close()
})

test('sessão ao vivo com microfone simulado: VAD, transcrição, proteção da fila e medidor real', async () => {
  test.skip(!(await localServerOnline()), 'servidor local de transcrição (speaches) indisponível')
  const { app, studio } = await launchStudio({ fakeAudio: FAKE_MIC, storage: { sinalize_stt_provider: 'local' } })
  await setViewport(studio, 1920, 1080)
  await waitPlayerReady(studio)

  await studio.getByRole('button', { name: 'Iniciar sessão' }).click()
  await expect(studio.getByRole('button', { name: 'Encerrar' })).toBeVisible()
  // Medidor alimentado pelo áudio capturado (WAV em loop), não por simulação.
  await expect.poll(() => studio.locator('text=RMS').locator('span').first().textContent(), { timeout: 15_000 }).not.toBe('−∞')

  const transcript = studio.getByRole('region', { name: 'Transcrição em tempo real' })
  await expect(transcript.getByText(/bom dia a todos/i).first()).toBeVisible({ timeout: 45_000 })
  await expect(studio.getByRole('region', { name: 'Fila de sinalização' }).getByText(/bom dia a todos/i).first()).toBeVisible()
  await studio.waitForTimeout(2500)
  await shot(studio, 'sessao-ao-vivo')

  await studio.getByRole('button', { name: 'Encerrar' }).click()
  await expect(studio.getByRole('button', { name: 'Iniciar sessão' })).toBeVisible()
  const loops = await studio.evaluate(() => window.sinalize.diag.snapshot().then((s) => s.summary.counts))
  expect(loops.segments).toBeGreaterThan(0)
  await app.close()
})
