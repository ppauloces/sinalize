import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PresentationApp } from './PresentationApp'

document.documentElement.classList.add('output')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PresentationApp />
  </StrictMode>,
)
