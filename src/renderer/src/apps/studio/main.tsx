import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { App } from './App'
import { applyTheme, savedTheme } from './theme'

// Aplica o tema antes do primeiro render para não piscar.
applyTheme(savedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
