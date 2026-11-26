import path from 'node:path'

// Pasta do renderer compilado (out/renderer), servida pelo protocolo app:// em produção.
export const RENDERER_DIR = path.join(__dirname, '../renderer')
export const PRELOAD = path.join(__dirname, '../preload/index.js')

// Em desenvolvimento o electron-vite serve o renderer com HMR; em produção, app://sinalize/.
export const pageUrl = (page: string) => {
  const dev = process.env.ELECTRON_RENDERER_URL
  return dev ? `${dev}/${page}` : `app://sinalize/${page}`
}
