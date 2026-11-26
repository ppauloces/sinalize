import { useEffect, useState } from 'react'
import type { OverlayState } from '../../../shared/overlay'

// Estado do overlay nas janelas flutuantes (sem a fiação da sessão do Studio).
export function useOverlayState() {
  const [state, setState] = useState<OverlayState | null>(null)
  useEffect(() => {
    const off = window.sinalize.overlay.onState(setState)
    void window.sinalize.overlay.get().then(setState)
    return off
  }, [])
  return state
}
