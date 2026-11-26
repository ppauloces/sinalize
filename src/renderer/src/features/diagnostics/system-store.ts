// Métricas reais do sistema (amostradas no processo principal a cada 2 s) e versão do app.
import { createStore } from 'zustand/vanilla'
import type { AppInfo } from '../../../../shared/ipc'
import type { SystemMetrics } from '../../../../shared/schemas'

export const systemStore = createStore(() => ({ metrics: null as SystemMetrics | null, app: null as AppInfo | null }))

export function watchSystem() {
  void window.sinalize.app.info().then((app) => systemStore.setState({ app }))
  return window.sinalize.system.onMetrics((metrics) => systemStore.setState({ metrics }))
}
