import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { syncTheme } from '@/features/appearance/appearance-store'
import { watchSystem } from '@/features/diagnostics/system-store'
import { StudioApp } from './StudioApp'

// Tema aplicado antes do primeiro render para não piscar.
syncTheme()
watchSystem()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500}>
      <StudioApp />
    </TooltipProvider>
  </StrictMode>,
)
