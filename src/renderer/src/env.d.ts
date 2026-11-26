/// <reference types="vite/client" />
import type { SinalizeApi } from '../../shared/api'

declare global {
  interface Window {
    sinalize: SinalizeApi
  }
}
