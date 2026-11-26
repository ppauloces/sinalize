// Telemetria por segmento e exportação do diagnóstico (consumido pelo módulo Diagnóstico do Studio).
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC, type DiagnosticsSnapshot } from '../../shared/ipc'
import { exportFormatSchema, telemetryEventSchema, type SystemMetrics } from '../../shared/schemas'
import * as telemetry from './telemetry'

const nowMs = () => performance.timeOrigin + performance.now()

export function registerDiagnosticsIpc(getMetrics: () => SystemMetrics | null) {
  const events: telemetry.TelEvent[] = []
  const system: SystemMetrics[] = []

  ipcMain.on(IPC.telemetry, (_e, ev: unknown) => {
    const parsed = telemetryEventSchema.safeParse(ev)
    if (parsed.success) telemetry.push(events, parsed.data)
  })

  ipcMain.handle(IPC.diagSnapshot, (): DiagnosticsSnapshot => {
    const now = nowMs()
    const metrics = getMetrics()
    if (metrics && system.at(-1) !== metrics) telemetry.push(system, metrics)
    return {
      now,
      summary: telemetry.summary(events, now),
      metrics: telemetry.METRICS,
      segments: telemetry.segments(events).slice(-200),
      system: metrics,
    }
  })

  ipcMain.handle(IPC.diagExport, async (e, format: unknown) => {
    const fmt = exportFormatSchema.parse(format)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const options = { defaultPath: `sinalize-diagnostico-${stamp}.${fmt}`, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }
    const owner = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePath } = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null
    const segs = telemetry.segments(events)
    const content = fmt === 'csv'
      ? telemetry.toCSV(segs)
      : JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            clock: 'ms epoch alta resolução (performance.timeOrigin + performance.now())',
            summary: telemetry.summary(events, nowMs()),
            segments: segs,
            events,
            system,
          },
          null,
          2,
        )
    fs.writeFileSync(filePath, content, 'utf8')
    return filePath
  })

  ipcMain.handle(IPC.diagReset, () => {
    events.length = 0
    system.length = 0
  })
}
