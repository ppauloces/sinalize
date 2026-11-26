/// <reference types="vite/client" />
import type { SinalizeApi } from '../../shared/ipc'

declare global {
  interface Window {
    sinalize: SinalizeApi
  }
}
