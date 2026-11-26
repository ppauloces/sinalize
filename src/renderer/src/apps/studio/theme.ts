import { readString, write } from '@/lib/storage'

const KEY = 'sinalize_theme'
export type Theme = 'light' | 'dark'

export const savedTheme = (): Theme => (readString(KEY, 'light') === 'dark' ? 'dark' : 'light')

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  write(KEY, theme)
}
