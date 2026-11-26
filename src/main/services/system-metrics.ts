// Métricas reais do sistema para a barra de status e o diagnóstico (CPU, RAM, GPU via nvidia-smi).
import { execFile } from 'node:child_process'
import os from 'node:os'
import { performance } from 'node:perf_hooks'
import { app } from 'electron'
import type { SystemMetrics } from '../../shared/schemas'

const INTERVAL_MS = 2000

export class SystemMetricsSampler {
  private prevCpu: { idle: number; total: number } | null = null
  private timer: NodeJS.Timeout | undefined
  private hasNvidia = true
  latest: SystemMetrics | null = null

  start(onSample: (m: SystemMetrics) => void) {
    const tick = () => void this.sample().then((m) => onSample((this.latest = m)))
    tick()
    this.timer = setInterval(tick, INTERVAL_MS)
  }

  stop() {
    clearInterval(this.timer)
  }

  private cpuPercent() {
    const c = os.cpus().reduce(
      (a, { times: t }) => {
        a.idle += t.idle
        a.total += t.user + t.nice + t.sys + t.idle + t.irq
        return a
      },
      { idle: 0, total: 0 },
    )
    const pct = this.prevCpu ? 100 * (1 - (c.idle - this.prevCpu.idle) / (c.total - this.prevCpu.total)) : null
    this.prevCpu = c
    return pct == null ? null : Math.round(pct)
  }

  // Sem GPU NVIDIA o nvidia-smi não existe: deixa de tentar e reporta gpu = null.
  private gpu(): Promise<SystemMetrics['gpu']> {
    if (!this.hasNvidia) return Promise.resolve(null)
    return new Promise((resolve) => {
      execFile(
        'nvidia-smi',
        ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
        { timeout: 1500, windowsHide: true },
        (err, out) => {
          if (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') this.hasNvidia = false
            return resolve(null)
          }
          const [name = 'GPU', util, used, total] = out.trim().split('\n')[0]!.split(/,\s*/)
          resolve({ name, util: Number(util), usedMB: Number(used), totalMB: Number(total) })
        },
      )
    })
  }

  private async sample(): Promise<SystemMetrics> {
    const metrics = app.getAppMetrics()
    return {
      t: performance.timeOrigin + performance.now(),
      cpuPct: this.cpuPercent(),
      appCpuPct: Math.round(metrics.reduce((n, m) => n + m.cpu.percentCPUUsage, 0)),
      appRamMB: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024),
      ramUsedMB: Math.round((os.totalmem() - os.freemem()) / 1048576),
      ramTotalMB: Math.round(os.totalmem() / 1048576),
      gpu: await this.gpu(),
    }
  }
}
