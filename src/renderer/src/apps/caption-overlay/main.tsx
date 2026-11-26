import '@/styles/globals.css'
// Fontes das legendas embarcadas: funcionam sem internet e não bloqueiam a renderização.
import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CaptionOverlay } from './CaptionOverlay'

document.documentElement.classList.add('output')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CaptionOverlay />
  </StrictMode>,
)
