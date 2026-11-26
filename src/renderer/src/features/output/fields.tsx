// Linhas de configuração no padrão de formulário técnico: rótulo à esquerda, controle à direita.
import { useId, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export function SettingsGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-line py-3 last:border-b-0', className)}>
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.07em] text-fg-2 uppercase">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

export function SettingRow({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,38%)_1fr] items-center gap-3">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-xs text-fg">
          {label}
        </label>
        {hint && <p className="text-[11px] leading-snug text-fg-3">{hint}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function SwitchSetting({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <SettingRow label={label} hint={hint} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </SettingRow>
  )
}

interface Option {
  value: string
  label: string
  disabled?: boolean
}

export function SelectSetting({ label, hint, value, options, onChange }: { label: string; hint?: ReactNode; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <SettingRow label={label} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" aria-label={label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  )
}

export function SliderSetting({
  label,
  hint,
  value,
  min,
  max,
  step,
  format = String,
  onChange,
}: {
  label: string
  hint?: ReactNode
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => v !== undefined && onChange(v)} className="flex-1" />
      <output className="w-16 shrink-0 text-right font-mono text-[11px] text-fg-2 tabular">{format(value)}</output>
    </SettingRow>
  )
}

export function ColorSetting({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <SettingRow label={label} htmlFor={id}>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-10 cursor-pointer rounded-sm border border-line bg-elevated p-0.5" />
      <span className="font-mono text-[11px] text-fg-3 uppercase">{value}</span>
    </SettingRow>
  )
}

// Acelerador é aplicado ao sair do campo ou com Enter (registrar a cada tecla prenderia atalhos parciais).
export function ShortcutSetting({ label, value, failed, onCommit }: { label: string; value: string; failed: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const id = useId()
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <SettingRow label={label} htmlFor={id} hint={failed ? <span className="text-danger">Indisponível: em uso por outro app ou inválido</span> : undefined}>
      <Input
        id={id}
        value={draft ?? value}
        spellCheck={false}
        autoComplete="off"
        placeholder="Sem atalho"
        aria-invalid={failed}
        className="font-mono"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </SettingRow>
  )
}
