// Estado das saídas (Telão e Overlay) espelhado do processo principal, que valida e persiste.
import { createStore } from 'zustand/vanilla'
import type { ArgsOf, OutputCommand, OutputCommandArgs, OutputPatch, OutputState } from '../../../../shared/output'
import { notify } from '../notify'

export const outputStore = createStore(() => ({ state: null as OutputState | null }))

const set = (state: OutputState) => outputStore.setState({ state })

export function watchOutputState() {
  const off = window.sinalize.output.onState(set)
  void window.sinalize.output.get().then(set)
  return off
}

const report = (e: unknown) => notify.error('Falha ao alterar a saída', String((e as Error)?.message ?? e))

export function outputCommand<C extends OutputCommand>(cmd: C, ...arg: ArgsOf<OutputCommandArgs[C]>) {
  return window.sinalize.output.command(cmd, ...arg).then(set).catch(report)
}

export function outputUpdate(patch: OutputPatch) {
  return window.sinalize.output.update(patch).then(set).catch(report)
}
