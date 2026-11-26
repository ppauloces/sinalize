import type { CSSProperties } from 'react'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useStore } from 'zustand'
import { appearanceStore } from '@/features/appearance/appearance-store'

const Toaster = (props: ToasterProps) => {
  const theme = useStore(appearanceStore, (s) => s.theme)
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-danger" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{ classNames: { toast: 'font-sans text-xs !rounded-md', description: '!text-fg-3' } }}
      style={
        {
          '--normal-bg': 'var(--elevated)',
          '--normal-text': 'var(--fg)',
          '--normal-border': 'var(--line)',
          '--border-radius': '5px',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
