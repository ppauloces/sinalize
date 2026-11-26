import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const page = (name: string) => resolve(`src/renderer/${name}.html`)

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          studio: page('studio'),
          'avatar-overlay': page('avatar-overlay'),
          'caption-overlay': page('caption-overlay'),
          presentation: page('presentation'),
        },
      },
    },
  },
})
