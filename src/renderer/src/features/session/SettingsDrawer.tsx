import { useEffect, useRef, useState } from 'react'
import { Activity, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Kbd } from '@/components/section'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { checkLocalServer, serverStore } from './server-status'
import { recorder, uiStore } from './session'
import { STT_PROVIDERS, sttStore, type SttProviderId } from './stt'

export function ServerPill() {
  const state = useStore(serverStore)
  const label = { online: 'Online', offline: 'Offline', checking: 'Reconectando...' }[state]
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        title="Status do servidor local de transcrição (http://localhost:8000)"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold',
          state === 'online' && 'border-success-border bg-success-soft text-success',
          state === 'offline' && 'border-danger-border bg-danger-soft text-danger',
          state === 'checking' && 'border-warning-border bg-warning-soft text-warning',
        )}
      >
        <span className={cn('size-1.5 rounded-full bg-current', state === 'checking' && 'animate-pulse-dot')} />
        localhost:8000 · {label}
      </span>
      {state !== 'online' && (
        <Button variant="outline" size="xs" disabled={state === 'checking'} onClick={() => void checkLocalServer(true)}>
          <RefreshCw className={cn(state === 'checking' && 'animate-spin')} />
          Reconectar
        </Button>
      )}
    </div>
  )
}

export function SettingsDrawer() {
  const { provider, apiKey } = useStore(sttStore)
  const { recording } = useStore(recorder.store)
  const { keyAttention } = useStore(uiStore)
  const [showKey, setShowKey] = useState(false)
  const keyInput = useRef<HTMLInputElement>(null)
  const needsKey = STT_PROVIDERS[provider].needsKey
  const keyOk = !needsKey || apiKey.trim().startsWith('sk-')

  // Gravação pediu a chave: foca e destaca o campo.
  useEffect(() => {
    if (keyAttention) keyInput.current?.focus()
  }, [keyAttention])

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-muted/60 p-3.5 shadow-sm">
      <Label className="text-[0.72rem] text-muted-foreground uppercase">Transcrição de voz</Label>
      <Select
        value={provider}
        disabled={recording}
        onValueChange={(v) => {
          sttStore.set((s) => ({ ...s, provider: v as SttProviderId }))
          if (v === 'local') void checkLocalServer(true)
        }}
      >
        <SelectTrigger className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STT_PROVIDERS).map(([id, p]) => (
            <SelectItem key={id} value={id}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center justify-between">
        <Label htmlFor="apiKey" className="text-[0.72rem] text-muted-foreground uppercase">
          Chave OpenAI
        </Label>
        <Badge variant="outline" className={cn(keyOk && 'border-success-border bg-success-soft text-success')}>
          {!needsKey ? '● Local, sem chave' : keyOk ? '● Configurada' : 'Sem chave'}
        </Badge>
      </div>
      <div className="relative">
        <Input
          id="apiKey"
          ref={keyInput}
          type={showKey ? 'text' : 'password'}
          placeholder="sk-..."
          autoComplete="off"
          value={apiKey}
          onChange={(e) => sttStore.set((s) => ({ ...s, apiKey: e.target.value }))}
          className={cn('bg-card pr-9 font-mono', keyAttention > 0 && !keyOk && 'border-destructive ring-3 ring-destructive/25')}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          onClick={() => setShowKey((v) => !v)}
          title="Mostrar/ocultar chave"
        >
          {showKey ? <EyeOff /> : <Eye />}
        </Button>
      </div>

      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => window.sinalize.openDiagnostics()}>
        <Activity />
        Painel de diagnóstico <Kbd>Ctrl+Shift+D</Kbd>
      </Button>
    </section>
  )
}
