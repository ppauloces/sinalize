// Campos do painel Overlay: cada um envia um patch validado pelo processo principal.
import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export function SwitchField({ label, checked, onChange, wide }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; wide?: boolean }) {
  return (
    <Label className={cn('cursor-pointer justify-between gap-3 rounded-lg py-1 text-[0.8rem] font-medium', wide && 'col-span-2')}>
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Label>
  )
}

interface Option {
  value: string
  label: string
  disabled?: boolean
}

export function SelectField({ label, value, options, onChange, wide }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', wide && 'col-span-2')}>
      <Label className="text-[0.72rem] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
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
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  format = String,
  onChange,
  wide,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
  wide?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', wide && 'col-span-2')}>
      <Label className="justify-between text-[0.72rem] text-muted-foreground">
        {label}
        <output className="font-medium tabular-nums">{format(value)}</output>
      </Label>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => v !== undefined && onChange(v)} />
    </div>
  )
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Label className="flex-col items-stretch gap-1.5 text-[0.72rem] text-muted-foreground">
      {label}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full cursor-pointer rounded-md border bg-card p-0.5" />
    </Label>
  )
}

// Acelerador é aplicado ao sair do campo ou com Enter (registrar a cada tecla prenderia atalhos parciais).
export function ShortcutField({ label, value, failed, onCommit }: { label: string; value: string; failed: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onCommit(draft.trim())
    setDraft(null)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-[0.72rem] text-muted-foreground">{label}</Label>
      <Input
        value={draft ?? value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={failed}
        className="h-8 font-mono text-[0.78rem]"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {failed && <small className="text-[0.7rem] text-danger">Indisponível: em uso por outro app ou inválido</small>}
    </div>
  )
}
