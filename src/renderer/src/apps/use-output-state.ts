import { useEffect, useState } from 'react'
import type { OutputState } from '../../../shared/output'

// Estado das saídas nas janelas de Overlay e Telão (sem a fiação da sessão do Studio).
export function useOutputState() {
  const [state, setState] = useState<OutputState | null>(null)
  useEffect(() => {
    const off = window.sinalize.output.onState(setState)
    void window.sinalize.output.get().then(setState)
    return off
  }, [])
  return state
}
