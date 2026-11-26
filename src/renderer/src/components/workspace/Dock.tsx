import type { ComponentType, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDockCollapse } from './DockPanel'

interface DockProps {
  title: string
  icon: ComponentType<{ className?: string }>
  actions?: ReactNode
  status?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

// Painel técnico: cabeçalho de 32 px e corpo com rolagem própria (nunca rola o workspace).
export function Dock({ title, icon: Icon, actions, status, children, className, bodyClassName }: DockProps) {
  const collapse = useDockCollapse()
  return (
    <section aria-label={title} className={cn('flex h-full min-h-0 min-w-0 flex-col bg-panel', className)}>
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2.5" onDoubleClick={collapse?.toggle}>
        {collapse ? (
          <button
            type="button"
            onClick={collapse.toggle}
            aria-expanded={!collapse.collapsed}
            aria-label={collapse.collapsed ? `Expandir ${title}` : `Recolher ${title}`}
            className="-ml-1 flex size-5 items-center justify-center rounded-sm text-fg-3 hover:bg-hover hover:text-fg"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', collapse.collapsed && '-rotate-90')} />
          </button>
        ) : null}
        <Icon className="size-3.5 shrink-0 text-fg-3" />
        <h2 className="truncate text-[11px] font-semibold tracking-[0.07em] text-fg-2 uppercase">{title}</h2>
        {status}
        <div className="ml-auto flex shrink-0 items-center gap-0.5" onDoubleClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </header>
      {!collapse?.collapsed && <div className={cn('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>}
    </section>
  )
}

// Linha rótulo/valor das áreas técnicas (cronômetro, estados, métricas).
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-3 text-xs', className)}>
      <span className="shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 truncate text-right text-fg">{children}</span>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 px-6 text-center">
      <Icon className="size-5 text-fg-3" />
      <p className="text-xs font-medium text-fg-2">{title}</p>
      {children && <p className="max-w-64 text-[11px] leading-relaxed text-fg-3">{children}</p>}
    </div>
  )
}
