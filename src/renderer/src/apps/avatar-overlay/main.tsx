import '@/styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AvatarOverlay } from './AvatarOverlay'

document.documentElement.classList.add('overlay')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvatarOverlay />
  </StrictMode>,
)
