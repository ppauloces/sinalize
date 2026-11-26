import { AudioLines } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { SettingsGroup, SliderSetting } from '../output/fields'
import { AUDIO_DEFAULTS, audioSettingsStore, setAudioSettings } from './audio-settings'
import { MixerPanel } from './Mixer'

export function AudioCalibration() {
  const { vadLevel, silenceMs } = useStore(audioSettingsStore)
  return (
    <SettingsGroup title="Detecção de fala">
      <SliderSetting
        label="Limiar de voz"
        hint="Nível médio do espectro que conta como fala. Aumente em ambientes ruidosos."
        value={vadLevel}
        min={4}
        max={80}
        step={1}
        onChange={(v) => setAudioSettings({ vadLevel: v })}
      />
      <SliderSetting
        label="Pausa que fecha a frase"
        hint="Silêncio necessário para enviar a frase ao avatar."
        value={silenceMs}
        min={300}
        max={2500}
        step={50}
        format={(v) => `${v} ms`}
        onChange={(v) => setAudioSettings({ silenceMs: v })}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAudioSettings({ vadLevel: AUDIO_DEFAULTS.vadLevel, silenceMs: AUDIO_DEFAULTS.silenceMs })}>
          Restaurar padrão
        </Button>
      </div>
    </SettingsGroup>
  )
}

export function AudioModule() {
  return (
    <ModuleFrame title="Áudio" description="Entrada do microfone, níveis reais e calibração da detecção de fala" icon={AudioLines}>
      <MixerPanel large />
      <div className="px-4">
        <AudioCalibration />
      </div>
    </ModuleFrame>
  )
}
