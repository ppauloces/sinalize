// Estado do Modo Overlay espelhado do processo principal (fonte da verdade e validação ficam lá).
import type { ArgsOf, OverlayCommand, OverlayCommandArgs, OverlayPatch, OverlayState } from '../../../../shared/overlay'
import { createStore } from '@/lib/store'
import { setStatus } from '../session/status'

export const overlayStore = createStore<OverlayState | null>(null)

export function initOverlayState() {
  const off = window.sinalize.overlay.onState((s) => overlayStore.set(s))
  void window.sinalize.overlay.get().then((s) => overlayStore.set(s))
  return off
}

const report = (e: unknown) => setStatus('Overlay: ' + ((e as Error)?.message ?? e), 'error')

export function overlayCommand<C extends OverlayCommand>(cmd: C, ...arg: ArgsOf<OverlayCommandArgs[C]>) {
  return window.sinalize.overlay
    .command(cmd, ...arg)
    .then((s) => overlayStore.set(s))
    .catch(report)
}

export function overlayUpdate(patch: OverlayPatch) {
  return window.sinalize.overlay
    .update(patch)
    .then((s) => overlayStore.set(s))
    .catch(report)
}
