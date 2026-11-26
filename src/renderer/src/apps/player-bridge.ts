import { useEffect, useState, type RefObject } from 'react'
import { PLAYER_COMMAND_TYPES } from '../../../shared/output'
import type { Player } from '@/features/avatar/player'

// Ponte do motor nas janelas de saída: a fila do Studio comanda; o estado do Unity volta a cada mudança.
export function usePlayerBridge(frame: RefObject<HTMLIFrameElement | null>) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const player = () => frame.current?.contentWindow?.vlibras as Player | undefined
    const offCmd = window.sinalize.player.onCmd((method, arg) => {
      const p = player()
      if (!p || !Object.hasOwn(PLAYER_COMMAND_TYPES, method)) return
      if (method === 'play') p.play(arg as string)
      else if (method === 'setSpeed') p.setSpeed(arg as number)
      else if (method === 'setAvatar') p.setAvatar(arg as string)
      else if (method === 'pause') p.pause()
      else if (method === 'resume') p.resume()
      else if (method === 'stop') p.stop()
    })
    let last = ''
    const timer = setInterval(() => {
      const p = player()
      const state = { status: p?.status ?? null, speed: p?.speed ?? null }
      setLoading(state.status === null)
      const key = `${state.status}|${state.speed}`
      if (key !== last) {
        last = key
        window.sinalize.player.status(state)
      }
    }, 50)
    return () => {
      offCmd()
      clearInterval(timer)
    }
  }, [frame])
  return loading
}
