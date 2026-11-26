import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Área dos módulos da sidebar (ao lado do monitor, que continua visível e ativo).
export function ModuleFrame({
  title,
  description,
  icon: Icon,
  actions,
  children,
  bodyClassName,
}: {
  title: string
  description?: string
  icon: ComponentType<{ className?: string }>
  actions?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3">
        <Icon className="size-4 text-fg-3" />
        <div className="min-w-0">
          <h1 className="text-[13px] leading-tight font-semibold text-fg">{title}</h1>
          {description && <p className="truncate text-[11px] text-fg-3">{description}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
      </header>
      <div className={cn('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>
    </section>
  )
}
