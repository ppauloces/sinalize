import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CaptionOverlay } from './CaptionOverlay'

document.documentElement.classList.add('overlay')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CaptionOverlay />
  </StrictMode>,
)
