// Inicializa o Sinalize compilado (out/) com perfil isolado para testes e capturas.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface LaunchOptions {
  // WAV usado como microfone (Chromium --use-file-for-fake-audio-capture).
  fakeAudio?: string
  storage?: Record<string, string>
}

export async function launchStudio({ fakeAudio, storage }: LaunchOptions = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sinalize-e2e-'))
  const args = ['.']
  if (fakeAudio) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeAudio}`)
  const app = await electron.launch({
    args,
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, SINALIZE_USER_DATA: userData, SINALIZE_E2E: '1' },
  })
  const studio = await studioPage(app)
  if (storage) {
    await studio.evaluate((entries) => Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v)), storage)
    await studio.reload()
  }
  await studio.getByRole('navigation', { name: 'Módulos' }).waitFor()
  return { app, studio, userData }
}

export async function studioPage(app: ElectronApplication) {
  for (let i = 0; i < 100; i++) {
    const page = app.windows().find((w) => w.url().includes('studio.html'))
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      return page
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('janela do Studio não abriu')
}

export async function windowByUrl(app: ElectronApplication, fragment: string, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const page = app.windows().find((w) => w.url().includes(fragment))
    if (page) {
      await page.waitForLoadState('load')
      return page
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`janela ${fragment} não abriu`)
}

// Emula a resolução da janela sem depender do tamanho do monitor físico.
export async function setViewport(page: Page, width: number, height: number) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await page.waitForTimeout(400)
}

// Espera o Unity do player do Studio carregar (depende da rede do VLibras).
export async function waitPlayerReady(page: Page, timeoutMs = 60000) {
  await page.waitForFunction(() => {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Avatar VLibras"]')
    return frame?.contentWindow?.vlibras?.status === 'idle'
  }, null, { timeout: timeoutMs })
}
