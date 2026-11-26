import { useEffect, useState } from 'react'
import { AudioLines, Mic, MicOff } from 'lucide-react'
import { useStore } from 'zustand'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Dock } from '@/components/workspace/Dock'
import { StatusDot } from '@/components/workspace/StatusDot'
import { cn } from '@/lib/utils'
import { recorder } from '../session/session'
import { audioSettingsStore, setAudioSettings } from './audio-settings'
import { LevelMeter, Waveform } from './AudioMeters'
import { gainToDb } from './meter'

// Entradas de áudio do sistema; os nomes só aparecem depois da permissão do microfone.
export function useAudioInputs() {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    const load = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setInputs(all.filter((d) => d.kind === 'audioinput')))
        .catch(() => setInputs([]))
    void load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
  }, [])
  return inputs
}

export function DeviceSelect({ className }: { className?: string }) {
  const inputs = useAudioInputs()
  const deviceId = useStore(audioSettingsStore, (s) => s.deviceId)
  const known = inputs.some((d) => d.deviceId === deviceId)
  return (
    <Select value={known ? deviceId : 'default'} onValueChange={(v) => setAudioSettings({ deviceId: v })}>
      <SelectTrigger size="sm" aria-label="Dispositivo de entrada" className={cn('min-w-0', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!inputs.some((d) => d.deviceId === 'default') && <SelectItem value="default">Padrão do sistema</SelectItem>}
        {inputs.map((d, i) => (
          <SelectItem key={d.deviceId || i} value={d.deviceId || 'default'}>
            {d.label || `Microfone ${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function GainControl() {
  const { gain, muted } = useStore(audioSettingsStore)
  const db = gainToDb(gain)
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAudioSettings({ muted: !muted })}
        aria-pressed={muted}
        aria-label={muted ? 'Desmutar microfone' : 'Mutar microfone'}
        title={muted ? 'Desmutar' : 'Mutar'}
        className={cn('flex size-6 shrink-0 items-center justify-center rounded-md border border-line', muted ? 'border-danger/50 bg-danger-soft text-danger' : 'bg-elevated text-fg-2 hover:bg-hover')}
      >
        {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      </button>
      <Slider aria-label="Ganho" value={[gain]} min={0} max={2} step={0.01} onValueChange={([v]) => v !== undefined && setAudioSettings({ gain: v })} className="flex-1" />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-fg-2 tabular">{Number.isFinite(db) ? `${db >= 0 ? '+' : ''}${db.toFixed(1).replace('.', ',')}` : '−∞'} dB</span>
    </div>
  )
}

function VoiceState() {
  const { recording, paused, voiceActive, micState } = useStore(recorder.store)
  const muted = useStore(audioSettingsStore, (s) => s.muted)
  const label = !recording ? 'Microfone desligado' : muted ? 'Mudo' : paused ? 'Captura pausada' : voiceActive ? 'Voz detectada' : 'Silêncio'
  return (
    <span className={cn('flex items-center justify-end gap-1.5 text-fg-2', micState.tone === 'error' && 'text-danger')} title={micState.message}>
      <StatusDot tone={!recording || paused ? 'idle' : muted ? 'error' : voiceActive ? 'ok' : 'idle'} />
      {micState.tone === 'error' || micState.tone === 'processing' ? micState.message : label}
    </span>
  )
}

export function MixerPanel({ large }: { large?: boolean }) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2 px-2.5 py-2', large && 'h-auto gap-4 p-4')}>
      <div className="flex items-center gap-2">
        {large && <span className="w-20 shrink-0 text-[11px] text-fg-3">Entrada</span>}
        <DeviceSelect className="flex-1" />
      </div>
      <GainControl />
      <LevelMeter height={large ? 20 : 10} status={<VoiceState />} />
      {/* A forma de onda usa só o espaço que sobra no dock (some quando não cabe). */}
      <div className={cn('relative min-h-0 overflow-hidden rounded-xs bg-app', large ? 'h-40' : 'flex-1')}>
        <Waveform className="absolute inset-0 h-full" />
      </div>
    </div>
  )
}

export function MixerDock() {
  return (
    <Dock title="Mixer de áudio" icon={AudioLines} bodyClassName="overflow-hidden">
      <MixerPanel />
    </Dock>
  )
}
